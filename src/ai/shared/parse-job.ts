export interface ParsedJobDraft {
  url: string;
  company: string;
  title: string;
  location: string;
  salary: string | null;
  source: string;
  notes: string;
  tags: string[];
  status: string;
  confidence: number;
}

const STOP_WORDS = new Set([
  "apply",
  "careers",
  "career",
  "job",
  "jobs",
  "position",
  "positions",
  "opening",
  "openings",
  "view",
  "details",
  "listings",
  "teams",
]);

const TITLE_CASE_ACRONYMS = new Set(["ai", "ml", "qa", "ui", "ux", "hr", "ios"]);

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lowered = part.toLowerCase();
      if (TITLE_CASE_ACRONYMS.has(lowered)) {
        return lowered.toUpperCase();
      }

      return lowered.charAt(0).toUpperCase() + lowered.slice(1);
    })
    .join(" ");
}

function cleanSegment(value: string) {
  return decodeURIComponent(value)
    .replace(/[+_]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickDomainLabel(hostname: string) {
  const stripped = hostname.replace(/^www\./, "");
  const parts = stripped.split(".");
  if (parts.length <= 2) {
    return parts[0] ?? stripped;
  }

  return parts[parts.length - 2] ?? stripped;
}

function getCompany(url: URL) {
  const companyHints = [
    url.searchParams.get("company"),
    url.searchParams.get("gh_src"),
    url.searchParams.get("organization"),
  ]
    .filter(Boolean)
    .map((value) => cleanSegment(value as string));

  if (companyHints[0]) {
    return titleCase(companyHints[0]);
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const hostLabel = pickDomainLabel(url.hostname);

  if (["greenhouse", "lever", "ashbyhq", "workable", "smartrecruiters"].includes(hostLabel)) {
    const candidate = pathParts[0] ?? "";
    return titleCase(cleanSegment(candidate || hostLabel));
  }

  if (!["linkedin", "indeed", "ziprecruiter"].includes(hostLabel)) {
    return titleCase(cleanSegment(hostLabel));
  }

  return titleCase(cleanSegment(pathParts[0] || hostLabel));
}

function getTitle(url: URL) {
  const explicit =
    url.searchParams.get("title") ??
    url.searchParams.get("job_title") ??
    url.searchParams.get("position");

  if (explicit) {
    return titleCase(cleanSegment(explicit));
  }

  const candidates = url.pathname
    .split("/")
    .filter(Boolean)
    .map(cleanSegment)
    .reverse();

  const selected =
    candidates.find((part) => {
      const tokens = part
        .toLowerCase()
        .split(/\s+/)
        .filter((token) => token && !STOP_WORDS.has(token));

      return tokens.length >= 2;
    }) ?? candidates[0] ?? "New role";

  const cleaned = selected
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token.toLowerCase()))
    .join(" ");

  return titleCase(cleaned || selected);
}

function getLocation(url: URL) {
  const explicit =
    url.searchParams.get("location") ??
    url.searchParams.get("loc") ??
    url.searchParams.get("city");

  if (explicit) {
    return titleCase(cleanSegment(explicit));
  }

  const haystack = `${url.hostname} ${decodeURIComponent(url.pathname)}`.toLowerCase();

  if (haystack.includes("remote")) {
    return "Remote";
  }

  if (haystack.includes("hybrid")) {
    return "Hybrid";
  }

  if (haystack.includes("onsite") || haystack.includes("on-site")) {
    return "On-site";
  }

  return "Location not listed";
}

function getSalary(url: URL) {
  const explicit =
    url.searchParams.get("salary") ??
    url.searchParams.get("compensation") ??
    url.searchParams.get("pay");

  if (explicit) {
    return cleanSegment(explicit);
  }

  const salaryMatch = decodeURIComponent(url.href).match(
    /(\$[\d,.]+(?:k|K)?(?:\s*-\s*\$?[\d,.]+(?:k|K)?)?)/
  );

  return salaryMatch?.[1] ?? null;
}

function getTags(
  company: string,
  title: string,
  location: string,
  source: string
) {
  const tags = new Set<string>();
  const normalizedTitle = title.toLowerCase();
  const normalizedLocation = location.toLowerCase();
  const normalizedSource = source.toLowerCase();

  if (normalizedLocation.includes("remote")) {
    tags.add("remote");
  }

  if (normalizedTitle.includes("senior") || normalizedTitle.includes("staff")) {
    tags.add("senior");
  }

  if (normalizedTitle.includes("product")) {
    tags.add("product");
  }

  if (normalizedTitle.includes("engineer") || normalizedTitle.includes("developer")) {
    tags.add("engineering");
  }

  if (normalizedTitle.includes("design")) {
    tags.add("design");
  }

  if (normalizedSource.includes("linkedin")) {
    tags.add("linkedin");
  }

  if (normalizedSource.includes("greenhouse") || normalizedSource.includes("lever")) {
    tags.add("direct");
  }

  if (company.length > 0) {
    tags.add(company.toLowerCase().replace(/\s+/g, "-"));
  }

  return [...tags];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function parseJobUrl(input: string): ParsedJobDraft {
  let url: URL;

  try {
    url = new URL(input);
  } catch (error) {
    throw new Error("Enter a valid job URL.");
  }

  const source = url.hostname.replace(/^www\./, "");
  const company = getCompany(url);
  const title = getTitle(url);
  const location = getLocation(url);
  const salary = getSalary(url);
  const tags = getTags(company, title, location, source);

  const confidence = clamp(
    0.4 +
      (company ? 0.15 : 0) +
      (title ? 0.2 : 0) +
      (location && location !== "Location not listed" ? 0.15 : 0) +
      (salary ? 0.08 : 0) +
      (tags.length > 0 ? 0.06 : 0),
    0.45,
    0.96
  );

  return {
    url: url.toString(),
    company,
    title,
    location,
    salary,
    source,
    notes: `Imported from ${source}. Review the parsed fields before saving.`,
    tags,
    status: "Applied",
    confidence,
  };
}
