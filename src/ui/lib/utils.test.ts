import { describe, expect, it, vi } from "vitest";
import { computeDashboardMetrics } from "./utils";
import type { JobApplication } from "./types";

function createApplication(
  id: number,
  overrides: Partial<JobApplication> = {}
): JobApplication {
  const now = new Date("2026-04-08T15:00:00.000Z").getTime();

  return {
    id,
    url: `https://example.com/jobs/${id}`,
    company: "Example",
    title: `Role ${id}`,
    location: "Remote",
    salary: null,
    appliedDate: now,
    status: "Wishlist",
    source: "example.com",
    notes: "",
    tags: [],
    confidence: null,
    parseConfidence: null,
    fitSummary: "",
    jobDescription: "",
    createdAt: now,
    lastUpdated: now,
    ...overrides,
  };
}

describe("computeDashboardMetrics", () => {
  it("tracks daily capture, touch, and reply activity", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-08T15:00:00.000Z"));

      const metrics = computeDashboardMetrics([
        createApplication(1),
        createApplication(2, {
          status: "Phone Screen",
        }),
        createApplication(3, {
          createdAt: new Date("2026-04-07T18:00:00.000Z").getTime(),
          lastUpdated: new Date("2026-04-07T18:00:00.000Z").getTime(),
          status: "Applied",
        }),
      ]);

      expect(metrics.capturedToday).toBe(2);
      expect(metrics.touchedToday).toBe(2);
      expect(metrics.repliesToday).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses createdAt for weekly added metrics and daily pace", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-04-08T15:00:00.000Z"));

      const metrics = computeDashboardMetrics([
        createApplication(1, {
          createdAt: new Date("2026-04-08T10:00:00.000Z").getTime(),
          appliedDate: new Date("2026-03-01T10:00:00.000Z").getTime(),
        }),
        createApplication(2, {
          createdAt: new Date("2026-04-06T10:00:00.000Z").getTime(),
          appliedDate: new Date("2026-02-14T10:00:00.000Z").getTime(),
        }),
        createApplication(3, {
          createdAt: new Date("2026-03-20T10:00:00.000Z").getTime(),
          appliedDate: new Date("2026-04-08T10:00:00.000Z").getTime(),
        }),
      ]);

      expect(metrics.appliedThisWeek).toBe(2);
      expect(metrics.dailyCaptureRate).toBeCloseTo(2 / 7, 5);
    } finally {
      vi.useRealTimers();
    }
  });
});
