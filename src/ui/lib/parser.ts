import { parseJobUrl, type ParsedJobDraft } from "../../ai/shared/parse-job";
import { isTauriRuntime } from "$lib/runtime";

export async function parseJobPosting(
  url: string,
  apiKey: string,
  model: string,
  resumeText = ""
) {
  const heuristic = parseJobUrl(url);
  const trimmedApiKey = apiKey.trim();
  const trimmedModel = model.trim() || "grok-4-fast-non-reasoning";
  const trimmedResumeText = resumeText.trim();

  if (!isTauriRuntime()) {
    return heuristic;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return await invoke<ParsedJobDraft>("parse_job_url", {
      url: heuristic.url,
      apiKey: trimmedApiKey || null,
      model: trimmedModel,
      resumeText: trimmedResumeText || null,
      heuristic,
    });
  } catch (error) {
    return heuristic;
  }
}
