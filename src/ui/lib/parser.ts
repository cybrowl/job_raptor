import { parseJobUrl, type ParsedJobDraft } from "../../ai/shared/parse-job";
import { isTauriRuntime } from "$lib/runtime";

export async function parseJobPosting(url: string, apiKey: string, model: string) {
  const heuristic = parseJobUrl(url);
  const trimmedApiKey = apiKey.trim();
  const trimmedModel = model.trim() || "grok-4-fast-non-reasoning";

  if (!trimmedApiKey || !isTauriRuntime()) {
    return heuristic;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");

    return await invoke<ParsedJobDraft>("parse_job_url", {
      url: heuristic.url,
      apiKey: trimmedApiKey,
      model: trimmedModel,
      heuristic,
    });
  } catch (error) {
    return heuristic;
  }
}
