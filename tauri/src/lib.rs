use std::fs;

use regex::Regex;
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParsedJobDraft {
    url: String,
    company: String,
    title: String,
    location: String,
    salary: Option<String>,
    source: String,
    notes: String,
    tags: Vec<String>,
    status: String,
    confidence: f64,
}

fn resolve_dialog_path(file_path: tauri_plugin_dialog::FilePath) -> Result<std::path::PathBuf, String> {
    file_path.into_path().map_err(|error| error.to_string())
}

fn normalize_string(raw: Option<&Value>, fallback: &str) -> String {
    raw.and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn normalize_nullable_string(raw: Option<&Value>, fallback: &Option<String>) -> Option<String> {
    match raw {
        Some(Value::Null) => None,
        Some(Value::String(value)) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => fallback.clone(),
    }
}

fn normalize_tags(raw: Option<&Value>, fallback: &[String]) -> Vec<String> {
    let Some(values) = raw.and_then(Value::as_array) else {
        return fallback.to_vec();
    };

    let mut tags = Vec::new();

    for value in values {
        if let Some(tag) = value.as_str() {
            let trimmed = tag.trim();
            if !trimmed.is_empty() && !tags.iter().any(|existing| existing == trimmed) {
                tags.push(trimmed.to_string());
            }
        }
    }

    if tags.is_empty() {
        fallback.to_vec()
    } else {
        tags
    }
}

fn normalize_confidence(raw: Option<&Value>, fallback: f64) -> f64 {
    let Some(value) = raw.and_then(Value::as_f64) else {
        return fallback;
    };

    value.clamp(0.0, 1.0)
}

fn normalize_draft(raw: &Value, fallback: &ParsedJobDraft) -> ParsedJobDraft {
    ParsedJobDraft {
        url: normalize_string(raw.get("url"), &fallback.url),
        company: normalize_string(raw.get("company"), &fallback.company),
        title: normalize_string(raw.get("title"), &fallback.title),
        location: normalize_string(raw.get("location"), &fallback.location),
        salary: normalize_nullable_string(raw.get("salary"), &fallback.salary),
        source: normalize_string(raw.get("source"), &fallback.source),
        notes: normalize_string(raw.get("notes"), &fallback.notes),
        tags: normalize_tags(raw.get("tags"), &fallback.tags),
        status: normalize_string(raw.get("status"), &fallback.status),
        confidence: normalize_confidence(raw.get("confidence"), fallback.confidence),
    }
}

fn extract_output_text(payload: &Value) -> Option<String> {
    if let Some(text) = payload.get("output_text").and_then(Value::as_str) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    let output = payload.get("output").and_then(Value::as_array)?;

    for item in output {
        if item.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }

        let Some(content) = item.get("content").and_then(Value::as_array) else {
            continue;
        };

        for part in content {
            if part.get("type").and_then(Value::as_str) != Some("output_text") {
                continue;
            }

            if let Some(text) = part.get("text").and_then(Value::as_str) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }

    None
}

fn extract_text_from_html(html: &str) -> String {
    let without_scripts = Regex::new(r"(?is)<script[\s\S]*?</script>")
        .unwrap()
        .replace_all(html, " ");
    let without_styles = Regex::new(r"(?is)<style[\s\S]*?</style>")
        .unwrap()
        .replace_all(&without_scripts, " ");
    let without_noscript = Regex::new(r"(?is)<noscript[\s\S]*?</noscript>")
        .unwrap()
        .replace_all(&without_styles, " ");
    let without_tags = Regex::new(r"(?is)<[^>]+>")
        .unwrap()
        .replace_all(&without_noscript, " ");

    Regex::new(r"\s+")
        .unwrap()
        .replace_all(&without_tags, " ")
        .trim()
        .to_string()
}

async fn fetch_page_excerpt(url: &str) -> String {
    let client = reqwest::Client::new();

    match client
        .get(url)
        .header(
            USER_AGENT,
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
        )
        .header(
            ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => match response.text().await {
            Ok(html) => extract_text_from_html(&html).chars().take(12_000).collect(),
            Err(_) => String::new(),
        },
        _ => String::new(),
    }
}

async fn parse_with_xai(
    url: &str,
    api_key: &str,
    model: &str,
    heuristic: &ParsedJobDraft,
) -> Result<ParsedJobDraft, String> {
    let page_excerpt = fetch_page_excerpt(url).await;

    let response = reqwest::Client::new()
        .post("https://api.x.ai/v1/responses")
        .bearer_auth(api_key)
        .header(CONTENT_TYPE, "application/json")
        .json(&json!({
            "model": model,
            "store": false,
            "input": [
                {
                    "role": "system",
                    "content": "You extract structured job posting data. Return JSON that exactly matches the schema. Prefer page evidence when present, otherwise preserve the heuristic draft. Confidence must be a number between 0 and 1."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": format!(
                                "Parse this job posting into structured JSON.\n\nURL: {}\n\nHeuristic draft: {}\n\n{}",
                                url,
                                serde_json::to_string(heuristic).map_err(|error| error.to_string())?,
                                if page_excerpt.is_empty() {
                                    "Page excerpt unavailable.".to_string()
                                } else {
                                    format!("Page excerpt: {}", page_excerpt)
                                }
                            )
                        }
                    ]
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "job_application_parse",
                    "strict": true,
                    "schema": {
                        "type": "object",
                        "additionalProperties": false,
                        "required": [
                            "url",
                            "company",
                            "title",
                            "location",
                            "salary",
                            "source",
                            "notes",
                            "tags",
                            "status",
                            "confidence"
                        ],
                        "properties": {
                            "url": { "type": "string" },
                            "company": { "type": "string" },
                            "title": { "type": "string" },
                            "location": { "type": "string" },
                            "salary": { "type": ["string", "null"] },
                            "source": { "type": "string" },
                            "notes": { "type": "string" },
                            "tags": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "status": { "type": "string" },
                            "confidence": {
                                "type": "number",
                                "minimum": 0,
                                "maximum": 1
                            }
                        }
                    }
                }
            }
        }))
        .send()
        .await
        .map_err(|error| error.to_string())?;

    if !response.status().is_success() {
        return Err(response.text().await.unwrap_or_else(|_| "xAI request failed.".into()));
    }

    let payload = response
        .json::<Value>()
        .await
        .map_err(|error| error.to_string())?;
    let output_text =
        extract_output_text(&payload).ok_or_else(|| "xAI returned no structured output.".to_string())?;
    let parsed = serde_json::from_str::<Value>(&output_text).map_err(|error| error.to_string())?;

    Ok(normalize_draft(&parsed, heuristic))
}

#[tauri::command]
async fn parse_job_url(
    url: String,
    api_key: Option<String>,
    model: Option<String>,
    heuristic: ParsedJobDraft,
) -> Result<ParsedJobDraft, String> {
    url::Url::parse(&url).map_err(|_| "Enter a valid job URL.".to_string())?;

    let effective_api_key = api_key
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .or_else(|| {
            std::env::var("XAI_API_KEY").ok().and_then(|value| {
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            })
        });

    let Some(api_key) = effective_api_key else {
        return Ok(heuristic);
    };

    let effective_model = model
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .or_else(|| {
            std::env::var("XAI_JOB_PARSER_MODEL").ok().and_then(|value| {
                let trimmed = value.trim().to_string();
                if trimmed.is_empty() {
                    None
                } else {
                    Some(trimmed)
                }
            })
        })
        .unwrap_or_else(|| "grok-4-fast-non-reasoning".to_string());

    match parse_with_xai(&url, &api_key, &effective_model, &heuristic).await {
        Ok(parsed) => Ok(parsed),
        Err(_) => Ok(heuristic),
    }
}

#[tauri::command]
async fn export_backup_file(
    app: AppHandle,
    contents: String,
    suggested_filename: Option<String>,
) -> Result<Option<String>, String> {
    let filename = suggested_filename
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "jobflow-backup.json".to_string());

    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Export JobFlow Backup")
            .set_file_name(filename)
            .add_filter("JobFlow Backup", &["json"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path = resolve_dialog_path(file_path)?;
    let saved_path = path.display().to_string();

    tauri::async_runtime::spawn_blocking(move || fs::write(&path, contents))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;

    Ok(Some(saved_path))
}

#[tauri::command]
async fn import_backup_file(app: AppHandle) -> Result<Option<String>, String> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import JobFlow Backup")
            .add_filter("JobFlow Backup", &["json"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path = resolve_dialog_path(file_path)?;

    let contents = tauri::async_runtime::spawn_blocking(move || fs::read_to_string(&path))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;

    Ok(Some(contents))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_applications_table",
            sql: "CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                url TEXT NOT NULL,
                company TEXT NOT NULL,
                title TEXT NOT NULL,
                location TEXT NOT NULL,
                salary TEXT,
                applied_date INTEGER NOT NULL,
                status TEXT NOT NULL,
                source TEXT NOT NULL,
                notes TEXT NOT NULL,
                tags TEXT NOT NULL,
                confidence REAL,
                created_at INTEGER NOT NULL,
                last_updated INTEGER NOT NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_settings_table",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:jobflow.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            parse_job_url,
            export_backup_file,
            import_backup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running JobFlow desktop shell");
}
