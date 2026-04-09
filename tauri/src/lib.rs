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
    parse_confidence: Option<f64>,
    fit_summary: String,
    job_description: String,
    confidence: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedBackupFile {
    contents: String,
    path: String,
}

const REVIEW_TITLE: &str = "Review Role Title";
const LOCATION_NOT_LISTED: &str = "Location not listed";
const ROLE_HINTS: &[&str] = &[
    "engineer",
    "developer",
    "designer",
    "manager",
    "director",
    "analyst",
    "scientist",
    "architect",
    "consultant",
    "specialist",
    "coordinator",
    "lead",
    "head",
    "product",
    "program",
    "marketing",
    "sales",
    "account",
    "operations",
    "finance",
    "legal",
    "support",
    "success",
    "recruiter",
    "talent",
    "security",
    "data",
    "people",
    "devops",
    "platform",
    "software",
    "frontend",
    "backend",
    "fullstack",
];

fn resolve_dialog_path(file_path: tauri_plugin_dialog::FilePath) -> Result<std::path::PathBuf, String> {
    file_path.into_path().map_err(|error| error.to_string())
}

fn decode_html_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

fn clean_text(value: &str) -> String {
    Regex::new(r"\s+")
        .unwrap()
        .replace_all(&decode_html_entities(value), " ")
        .trim()
        .to_string()
}

fn truncate_chars(value: &str, limit: usize) -> String {
    value.chars().take(limit).collect::<String>()
}

fn title_has_role_signal(value: &str) -> bool {
    let normalized = value.to_lowercase();
    ROLE_HINTS.iter().any(|hint| normalized.contains(hint))
}

fn looks_like_placeholder_title(value: &str) -> bool {
    let trimmed = value.trim();

    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case(REVIEW_TITLE) {
        return true;
    }

    if Regex::new(r"(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
        .unwrap()
        .is_match(trimmed)
    {
        return true;
    }

    let normalized = trimmed
        .to_lowercase()
        .replace([' ', '-', '_'], "");

    if normalized.len() < 10 || !normalized.chars().all(|character| character.is_ascii_alphanumeric()) {
        return false;
    }

    let digit_count = normalized.chars().filter(|character| character.is_ascii_digit()).count();
    let vowel_count = normalized
        .chars()
        .filter(|character| matches!(character, 'a' | 'e' | 'i' | 'o' | 'u'))
        .count();

    Regex::new(r"(?i)^[a-f0-9]{12,}$").unwrap().is_match(&normalized)
        || (digit_count as f64 / normalized.len() as f64 >= 0.28
            && vowel_count as f64 / normalized.len() as f64 <= 0.18)
}

fn extract_meta_content(html: &str, key: &str) -> Option<String> {
    let escaped = regex::escape(key);
    let patterns = [
        format!(
            r#"(?is)<meta[^>]+(?:property|name)\s*=\s*["']{}["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*>"#,
            escaped
        ),
        format!(
            r#"(?is)<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+(?:property|name)\s*=\s*["']{}["'][^>]*>"#,
            escaped
        ),
    ];

    for pattern in patterns {
        if let Ok(regex) = Regex::new(&pattern) {
            if let Some(capture) = regex.captures(html) {
                if let Some(value) = capture.get(1) {
                    let cleaned = clean_text(value.as_str());
                    if !cleaned.is_empty() {
                        return Some(cleaned);
                    }
                }
            }
        }
    }

    None
}

fn extract_tag_text(html: &str, tag: &str) -> Option<String> {
    let pattern = format!(r#"(?is)<{tag}[^>]*>(.*?)</{tag}>"#);
    let regex = Regex::new(&pattern).ok()?;
    let capture = regex.captures(html)?;
    let value = capture.get(1)?.as_str();
    let cleaned = clean_text(value);

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

fn extract_json_ld_blocks(html: &str) -> Vec<Value> {
    let regex =
        Regex::new(r#"(?is)<script[^>]+type\s*=\s*["']application/ld\+json["'][^>]*>(.*?)</script>"#)
            .unwrap();

    regex
        .captures_iter(html)
        .filter_map(|capture| capture.get(1))
        .filter_map(|content| serde_json::from_str::<Value>(content.as_str().trim()).ok())
        .collect()
}

fn value_matches_job_posting(value: &Value) -> bool {
    match value {
        Value::String(kind) => kind.eq_ignore_ascii_case("JobPosting"),
        Value::Array(values) => values.iter().any(value_matches_job_posting),
        _ => false,
    }
}

fn find_job_posting(value: &Value) -> Option<&Value> {
    match value {
        Value::Object(map) => {
            if map.get("@type").is_some_and(value_matches_job_posting) {
                return Some(value);
            }

            map.values().find_map(find_job_posting)
        }
        Value::Array(values) => values.iter().find_map(find_job_posting),
        _ => None,
    }
}

fn value_as_string(value: Option<&Value>) -> Option<String> {
    value.and_then(Value::as_str).map(clean_text).filter(|value| !value.is_empty())
}

fn extract_location_from_job_posting(job_posting: &Value) -> Option<String> {
    if let Some(remote) = value_as_string(job_posting.pointer("/applicantLocationRequirements/name")) {
        return Some(remote);
    }

    let locations = match job_posting.get("jobLocation") {
        Some(Value::Array(values)) => values,
        Some(Value::Object(_)) => std::slice::from_ref(job_posting.get("jobLocation")?),
        _ => return None,
    };

    for location in locations {
        let address = location.get("address").unwrap_or(location);
        let parts = [
            value_as_string(address.get("addressLocality")),
            value_as_string(address.get("addressRegion")),
            value_as_string(address.get("addressCountry")),
        ]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>();

        if !parts.is_empty() {
            return Some(parts.join(", "));
        }
    }

    None
}

fn extract_salary_from_job_posting(job_posting: &Value) -> Option<String> {
    let base_salary = job_posting.get("baseSalary")?;
    let currency = value_as_string(base_salary.get("currency"))
        .or_else(|| value_as_string(base_salary.pointer("/value/currency")))
        .unwrap_or_else(|| "USD".to_string());
    let symbol = if currency.eq_ignore_ascii_case("USD") { "$" } else { "" };

    let value = base_salary.get("value").unwrap_or(base_salary);
    let min = value.get("minValue").and_then(Value::as_f64);
    let max = value.get("maxValue").and_then(Value::as_f64);

    let format_number = |amount: f64| {
        if amount >= 1000.0 {
            format!("{symbol}{}K", (amount / 1000.0).round() as i64)
        } else {
            format!("{symbol}{}", amount.round() as i64)
        }
    };

    match (min, max) {
        (Some(min_value), Some(max_value)) => {
            Some(format!("{} - {}", format_number(min_value), format_number(max_value)))
        }
        (Some(min_value), None) => Some(format_number(min_value)),
        (None, Some(max_value)) => Some(format_number(max_value)),
        _ => value_as_string(base_salary.get("value")),
    }
}

fn extract_description_from_job_posting(job_posting: &Value) -> Option<String> {
    value_as_string(job_posting.get("description")).map(|value| truncate_chars(&value, 16_000))
}

fn best_document_title_candidate(value: &str, company: &str) -> Option<String> {
    let cleaned = clean_text(value);

    if cleaned.is_empty() {
        return None;
    }

    let company_normalized = company.trim().to_lowercase();
    let separator = Regex::new(r"\s(?:\||-|—|–|•|:)\s").unwrap();
    let mut segments = separator
        .split(&cleaned)
        .map(clean_text)
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();

    if segments.is_empty() {
        segments.push(cleaned.clone());
    }

    segments
        .into_iter()
        .find(|segment| {
            let normalized = segment.to_lowercase();

            !looks_like_placeholder_title(segment)
                && normalized != company_normalized
                && (title_has_role_signal(segment) || segment.split_whitespace().count() >= 2)
        })
        .or_else(|| {
            if looks_like_placeholder_title(&cleaned) {
                None
            } else {
                Some(cleaned)
            }
        })
}

fn rebuild_tags(company: &str, title: &str, location: &str, source: &str) -> Vec<String> {
    let mut tags = Vec::<String>::new();
    let normalized_title = title.to_lowercase();
    let normalized_location = location.to_lowercase();
    let normalized_source = source.to_lowercase();

    let mut push_tag = |value: &str| {
        if !tags.iter().any(|existing| existing == value) {
            tags.push(value.to_string());
        }
    };

    if normalized_location.contains("remote") {
        push_tag("remote");
    }

    if normalized_title.contains("senior") || normalized_title.contains("staff") {
        push_tag("senior");
    }

    if normalized_title.contains("product") {
        push_tag("product");
    }

    if normalized_title.contains("engineer") || normalized_title.contains("developer") {
        push_tag("engineering");
    }

    if normalized_title.contains("design") {
        push_tag("design");
    }

    if normalized_source.contains("linkedin") {
        push_tag("linkedin");
    }

    if normalized_source.contains("greenhouse")
        || normalized_source.contains("lever")
        || normalized_source.contains("ashbyhq")
    {
        push_tag("direct");
    }

    if !company.trim().is_empty() {
        push_tag(&company.to_lowercase().replace(' ', "-"));
    }

    tags
}

fn enrich_heuristic_from_html(html: &str, heuristic: &ParsedJobDraft) -> ParsedJobDraft {
    if html.trim().is_empty() {
        return heuristic.clone();
    }

    let mut draft = heuristic.clone();
    let mut page_title = None;
    let mut page_company = None;
    let mut page_location = None;
    let mut page_salary = None;
    let mut page_description = None;

    for block in extract_json_ld_blocks(html) {
        let Some(job_posting) = find_job_posting(&block) else {
            continue;
        };

        page_title = value_as_string(job_posting.get("title"));
        page_company = value_as_string(job_posting.pointer("/hiringOrganization/name"));
        page_location = extract_location_from_job_posting(job_posting);
        page_salary = extract_salary_from_job_posting(job_posting);
        page_description = extract_description_from_job_posting(job_posting);
        break;
    }

    if let Some(company) = page_company.filter(|value| !value.is_empty()) {
        draft.company = company;
    }

    let title_candidate = page_title
        .or_else(|| extract_meta_content(html, "og:title"))
        .or_else(|| extract_meta_content(html, "twitter:title"))
        .or_else(|| extract_tag_text(html, "title"))
        .and_then(|value| best_document_title_candidate(&value, &draft.company));

    if let Some(title) = title_candidate {
        if !looks_like_placeholder_title(&title) {
            draft.title = title;
        }
    }

    if let Some(location) = page_location.filter(|value| !value.is_empty()) {
        draft.location = location;
    } else if let Some(meta_location) = extract_meta_content(html, "og:description")
        .filter(|value| value.to_lowercase().contains("remote"))
    {
        draft.location = meta_location;
    }

    if let Some(salary) = page_salary.filter(|value| !value.is_empty()) {
        draft.salary = Some(salary);
    }

    let fallback_description = extract_meta_content(html, "description")
        .or_else(|| extract_meta_content(html, "og:description"))
        .or_else(|| extract_meta_content(html, "twitter:description"))
        .map(|value| truncate_chars(&value, 16_000))
        .unwrap_or_else(|| truncate_chars(&extract_text_from_html(html), 16_000));

    if let Some(description) = page_description.filter(|value| !value.is_empty()) {
        draft.job_description = description;
    } else {
        draft.job_description = fallback_description;
    }

    draft.tags = rebuild_tags(&draft.company, &draft.title, &draft.location, &draft.source);

    if draft.title != heuristic.title && !looks_like_placeholder_title(&draft.title) {
        draft.confidence = draft.confidence.max(0.72);
        draft.notes = format!(
            "Imported from {}. Page metadata filled in more reliable job details; review the parsed fields before saving.",
            draft.source
        );
    } else if looks_like_placeholder_title(&draft.title) {
        draft.confidence = draft.confidence.min(0.46);
        draft.notes = format!(
            "Imported from {}. The URL and page metadata still did not reveal a reliable role title, so review the parsed fields before saving.",
            draft.source
        );
        draft.title = REVIEW_TITLE.to_string();
    } else if draft.location != heuristic.location || draft.salary != heuristic.salary {
        draft.confidence = draft.confidence.max(0.62);
    }

    if draft.location.trim().is_empty() {
        draft.location = LOCATION_NOT_LISTED.to_string();
    }

    draft.parse_confidence = Some(draft.confidence);

    draft
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

fn normalize_optional_confidence(raw: Option<&Value>, fallback: Option<f64>) -> Option<f64> {
    match raw {
        Some(Value::Null) => None,
        Some(value) => value.as_f64().map(|score| score.clamp(0.0, 1.0)).or(fallback),
        None => fallback,
    }
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
        parse_confidence: normalize_optional_confidence(
            raw.get("parseConfidence"),
            fallback.parse_confidence,
        ),
        fit_summary: normalize_string(raw.get("fitSummary"), &fallback.fit_summary),
        job_description: normalize_string(raw.get("jobDescription"), &fallback.job_description),
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

async fn fetch_page_html(url: &str) -> String {
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
        Ok(response) if response.status().is_success() => response.text().await.unwrap_or_default(),
        _ => String::new(),
    }
}

async fn parse_with_xai(
    url: &str,
    api_key: &str,
    model: &str,
    heuristic: &ParsedJobDraft,
    page_excerpt: &str,
    resume_excerpt: &str,
) -> Result<ParsedJobDraft, String> {
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
                    "content": "You extract structured job posting data and score candidate fit. Return JSON that exactly matches the schema. Prefer page evidence when present, otherwise preserve the heuristic draft. parseConfidence is the reliability of the parsed role data. If resume text is provided, confidence must be the candidate-to-role fit score between 0 and 1 and fitSummary should briefly explain the match. If no resume text is provided, keep confidence aligned with parseConfidence and leave fitSummary empty."
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": format!(
                                "Parse this job posting into structured JSON.\n\nURL: {}\n\nHeuristic draft: {}\n\n{}\n\n{}",
                                url,
                                serde_json::to_string(heuristic).map_err(|error| error.to_string())?,
                                if page_excerpt.trim().is_empty() {
                                    "Page excerpt unavailable.".to_string()
                                } else {
                                    format!("Page excerpt: {}", page_excerpt)
                                },
                                if resume_excerpt.trim().is_empty() {
                                    "Resume text unavailable. Keep confidence aligned with parseConfidence.".to_string()
                                } else {
                                    format!("Resume text: {}", resume_excerpt)
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
                            "parseConfidence",
                            "fitSummary",
                            "jobDescription",
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
                            "parseConfidence": {
                                "type": ["number", "null"],
                                "minimum": 0,
                                "maximum": 1
                            },
                            "fitSummary": { "type": "string" },
                            "jobDescription": { "type": "string" },
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
    resume_text: Option<String>,
    heuristic: ParsedJobDraft,
) -> Result<ParsedJobDraft, String> {
    url::Url::parse(&url).map_err(|_| "Enter a valid job URL.".to_string())?;
    let page_html = fetch_page_html(&url).await;
    let enriched = enrich_heuristic_from_html(&page_html, &heuristic);
    let page_excerpt = extract_text_from_html(&page_html).chars().take(12_000).collect::<String>();
    let resume_excerpt = resume_text
        .map(|value| truncate_chars(value.trim(), 12_000))
        .unwrap_or_default();

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
        return Ok(enriched);
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

    match parse_with_xai(
        &url,
        &api_key,
        &effective_model,
        &enriched,
        &page_excerpt,
        &resume_excerpt,
    )
    .await
    {
        Ok(parsed) => Ok(parsed),
        Err(_) => Ok(enriched),
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
        .unwrap_or_else(|| "job-raptor-backup.json".to_string());

    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Export Job Raptor Backup")
            .set_file_name(filename)
            .add_filter("Job Raptor Backup", &["json"])
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
async fn export_paper_pdf(
    app: AppHandle,
    bytes: Vec<u8>,
    suggested_filename: Option<String>,
) -> Result<Option<String>, String> {
    let filename = suggested_filename
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "resume-paper.pdf".to_string());

    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Export Resume Paper")
            .set_file_name(filename)
            .add_filter("PDF", &["pdf"])
            .blocking_save_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path = resolve_dialog_path(file_path)?;
    let saved_path = path.display().to_string();

    tauri::async_runtime::spawn_blocking(move || fs::write(&path, bytes))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;

    Ok(Some(saved_path))
}

#[tauri::command]
async fn import_backup_file(app: AppHandle) -> Result<Option<ImportedBackupFile>, String> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_title("Import Job Raptor Backup")
            .add_filter("Job Raptor Backup", &["json"])
            .blocking_pick_file()
    })
    .await
    .map_err(|error| error.to_string())?;

    let Some(file_path) = selected else {
        return Ok(None);
    };

    let path = resolve_dialog_path(file_path)?;
    let saved_path = path.display().to_string();

    let contents = tauri::async_runtime::spawn_blocking(move || fs::read_to_string(&path))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;

    Ok(Some(ImportedBackupFile {
        contents,
        path: saved_path,
    }))
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
        Migration {
            version: 3,
            description: "add_resume_and_job_detail_columns",
            sql: "ALTER TABLE applications ADD COLUMN parse_confidence REAL;
ALTER TABLE applications ADD COLUMN fit_summary TEXT NOT NULL DEFAULT '';
ALTER TABLE applications ADD COLUMN job_description TEXT NOT NULL DEFAULT '';",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:job-raptor.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            parse_job_url,
            export_backup_file,
            export_paper_pdf,
            import_backup_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Job Raptor desktop shell");
}
