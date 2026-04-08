import {
  PIPELINE_STAGES,
  type CountBucket,
  type DashboardMetrics,
  type JobApplication,
} from "$lib/types";

const DAY_MS = 86_400_000;
const STALE_WINDOW_DAYS = 10;

function clampToDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function toDateInputValue(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function fromDateInputValue(value: string) {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

export function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

export function formatRelativeTime(timestamp: number) {
  const diffDays = Math.round((Date.now() - timestamp) / DAY_MS);

  if (diffDays <= 0) {
    return "Today";
  }

  if (diffDays === 1) {
    return "1 day ago";
  }

  return `${diffDays} days ago`;
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatSourceLabel(source: string) {
  const normalized = source
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .replace(/\.(com|io|ai|co|org|net|jobs|careers)$/i, "");

  if (!normalized) {
    return "Direct";
  }

  const parts = normalized.split(/[-_.]+/).filter(Boolean);

  if (parts.length > 1) {
    return parts
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function buildRecentCountSeries(
  applications: JobApplication[],
  getTimestamp: (application: JobApplication) => number,
  filter: (application: JobApplication) => boolean = () => true,
  days = 7
) {
  const today = clampToDay(Date.now());
  const windowStart = today - DAY_MS * (days - 1);
  const buckets = Array.from({ length: days }, () => 0);

  for (const application of applications) {
    if (!filter(application)) {
      continue;
    }

    const bucketTimestamp = clampToDay(getTimestamp(application));

    if (bucketTimestamp < windowStart || bucketTimestamp > today) {
      continue;
    }

    const index = Math.floor((bucketTimestamp - windowStart) / DAY_MS);
    buckets[index] += 1;
  }

  return buckets;
}

export function compareRecentPeriods(
  applications: JobApplication[],
  getTimestamp: (application: JobApplication) => number,
  filter: (application: JobApplication) => boolean = () => true,
  days = 7
) {
  const today = clampToDay(Date.now());
  const currentStart = today - DAY_MS * (days - 1);
  const previousStart = currentStart - DAY_MS * days;
  const currentEnd = today + DAY_MS;

  let current = 0;
  let previous = 0;

  for (const application of applications) {
    if (!filter(application)) {
      continue;
    }

    const bucketTimestamp = clampToDay(getTimestamp(application));

    if (bucketTimestamp >= currentStart && bucketTimestamp < currentEnd) {
      current += 1;
      continue;
    }

    if (bucketTimestamp >= previousStart && bucketTimestamp < currentStart) {
      previous += 1;
    }
  }

  return { current, previous };
}

export function sortApplicationsByRecent(applications: JobApplication[]) {
  return [...applications].sort((left, right) => right.lastUpdated - left.lastUpdated);
}

export function isActiveStatus(status: string) {
  return status !== "Rejected" && status !== "Archived";
}

export function buildStageBreakdown(applications: JobApplication[]): CountBucket[] {
  return PIPELINE_STAGES.map((label) => ({
    label,
    total: applications.filter((application) => application.status === label).length,
  })).filter((bucket) => bucket.total > 0);
}

export function buildSourceBreakdown(applications: JobApplication[]): CountBucket[] {
  const counts = new Map<string, number>();

  for (const application of applications) {
    counts.set(application.source, (counts.get(application.source) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
}

export function computeInsight(
  applications: JobApplication[],
  sourceBreakdown: CountBucket[],
  staleCount: number,
  responseRate: number
) {
  if (applications.length === 0) {
    return "Add one role and Job Raptor will start showing where your energy compounds fastest.";
  }

  if (staleCount > 0) {
    return `${staleCount} thread${
      staleCount === 1 ? "" : "s"
    } is cooling off. A focused follow-up sweep today could wake the pipeline back up.`;
  }

  if (responseRate >= 40) {
    return "Your pipeline has real lift. Double down on the channels already turning applications into conversations.";
  }

  if (sourceBreakdown[0]) {
    return `${formatSourceLabel(
      sourceBreakdown[0].label
    )} is heating up. You are building the strongest signal there right now, so keep feeding it while it is warm.`;
  }

  return "Keep mixing direct applications, referrals, and warm outreach so the strongest channel becomes obvious faster.";
}

export function computeDashboardMetrics(applications: JobApplication[]): DashboardMetrics {
  const now = Date.now();
  const today = clampToDay(now);
  const tomorrow = today + DAY_MS;
  const activePipeline = applications.filter((application) =>
    isActiveStatus(application.status)
  ).length;
  const appliedThisWeek = applications.filter(
    (application) => now - application.createdAt <= DAY_MS * 7
  ).length;
  const capturedToday = applications.filter(
    (application) => application.createdAt >= today && application.createdAt < tomorrow
  ).length;
  const touchedToday = applications.filter(
    (application) => application.lastUpdated >= today && application.lastUpdated < tomorrow
  ).length;
  const repliesToday = applications.filter(
    (application) =>
      application.lastUpdated >= today &&
      application.lastUpdated < tomorrow &&
      application.status !== "Wishlist" &&
      application.status !== "Applied"
  ).length;
  const responded = applications.filter(
    (application) =>
      application.status !== "Wishlist" && application.status !== "Applied"
  ).length;
  const responseRate =
    applications.length === 0 ? 0 : (responded / applications.length) * 100;
  const staleCount = applications.filter(
    (application) =>
      isActiveStatus(application.status) &&
      now - application.lastUpdated >= DAY_MS * STALE_WINDOW_DAYS
  ).length;
  const stageBreakdown = buildStageBreakdown(applications);
  const sourceBreakdown = buildSourceBreakdown(applications);
  const dailyCaptureRate =
    buildRecentCountSeries(applications, (application) => application.createdAt).reduce(
      (sum, count) => sum + count,
      0
    ) / 7;

  return {
    totalApplications: applications.length,
    activePipeline,
    appliedThisWeek,
    capturedToday,
    touchedToday,
    repliesToday,
    dailyCaptureRate,
    responseRate,
    staleCount,
    stageBreakdown,
    sourceBreakdown,
    insight: computeInsight(applications, sourceBreakdown, staleCount, responseRate),
  };
}

export function filterApplications(applications: JobApplication[], query: string) {
  const trimmed = query.trim().toLowerCase();

  if (!trimmed) {
    return applications;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);

  return applications.filter((application) =>
    tokens.every((token) => {
      const [rawKey, ...rawValueParts] = token.split(":");

      if (rawValueParts.length > 0) {
        const value = rawValueParts.join(":");

        switch (rawKey) {
          case "status":
            return application.status.toLowerCase().includes(value);
          case "source":
            return application.source.toLowerCase().includes(value);
          case "tag":
            return application.tags.some((tag) => tag.toLowerCase().includes(value));
          case "company":
            return application.company.toLowerCase().includes(value);
          case "location":
            return application.location.toLowerCase().includes(value);
          default:
            return false;
        }
      }

      const haystack = [
        application.company,
        application.title,
        application.location,
        application.source,
        application.notes,
        ...application.tags,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(token);
    })
  );
}

export function normalizeTagInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
