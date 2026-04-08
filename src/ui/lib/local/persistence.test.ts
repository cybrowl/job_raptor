import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseBackupText } from "./persistence";

describe("parseBackupText", () => {
  it("accepts the sample backup export from mock_data", () => {
    const text = readFileSync("mock_data/job-raptor-backup-2026-04-08.json", "utf8");
    const backup = parseBackupText(text);

    expect(backup.kind).toBe("job-raptor-backup");
    expect(backup.version).toBe(1);
    expect(backup.applications).toHaveLength(12);
    expect(backup.settings.xAiModel).toBe("grok-4-fast-non-reasoning");
    expect(backup.settings.resumeProfile.rawText).toBe("");
    expect(backup.applications[0]?.id).toBeGreaterThan(0);
  });
});
