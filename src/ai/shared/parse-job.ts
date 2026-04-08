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
  confidence: number | null;
  parseConfidence: number | null;
  fitSummary: string;
  jobDescription: string;
}

const REVIEW_TITLE = "Review Role Title";
const LOCATION_NOT_LISTED = "Location not listed";

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
  "listing",
  "listings",
  "teams",
  "team",
  "roles",
  "role",
  "opportunities",
  "opportunity",
]);

const TITLE_CASE_ACRONYMS = new Set([
  "ai",
  "ml",
  "qa",
  "ui",
  "ux",
  "hr",
  "ios",
  "api",
  "sql",
  "seo",
  "b2b",
  "b2c",
]);

const ATS_HOSTS = new Set([
  "greenhouse",
  "lever",
  "ashbyhq",
  "workable",
  "smartrecruiters",
]);

const ROLE_HINTS = [
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
  "front-end",
  "backend",
  "back-end",
  "fullstack",
  "full-stack",
];

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
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[+_]/g, " ")
    .replace(/[-–—]/g, " ")
    .replace(/[()[\],]+/g, " ")
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

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function looksLikeOpaqueIdentifier(value: string) {
  const raw = value.trim();

  if (!raw) {
    return false;
  }

  if (isUuidLike(raw)) {
    return true;
  }

  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, "");

  if (normalized.length < 10 || !/^[a-z0-9]+$/.test(normalized)) {
    return false;
  }

  const digitCount = [...normalized].filter((character) => /\d/.test(character)).length;
  const vowelCount = [...normalized].filter((character) => /[aeiou]/.test(character)).length;
  const hexish = /^[a-f0-9]+$/i.test(normalized);

  if (hexish && normalized.length >= 12) {
    return true;
  }

  return digitCount / normalized.length >= 0.28 && vowelCount / normalized.length <= 0.18;
}

function hasRoleSignal(value: string) {
  const normalized = value.toLowerCase();
  return ROLE_HINTS.some((hint) => normalized.includes(hint));
}

function getCompany(url: URL) {
  const companyHints = [
    url.searchParams.get("company"),
    url.searchParams.get("organization"),
    url.searchParams.get("org"),
  ]
    .filter(Boolean)
    .map((value) => cleanSegment(value as string));

  if (companyHints[0]) {
    return titleCase(companyHints[0]);
  }

  const pathParts = url.pathname.split("/").filter(Boolean);
  const hostLabel = pickDomainLabel(url.hostname);

  if (ATS_HOSTS.has(hostLabel)) {
    const candidate = cleanSegment(pathParts[0] ?? "");
    return titleCase(candidate || hostLabel);
  }

  if (!["linkedin", "indeed", "ziprecruiter"].includes(hostLabel)) {
    return titleCase(cleanSegment(hostLabel));
  }

  if (hostLabel === "linkedin" && pathParts[0] === "company" && pathParts[1]) {
    return titleCase(cleanSegment(pathParts[1]));
  }

  return titleCase(cleanSegment(pathParts[0] || hostLabel));
}

function isMeaningfulTitleSegment(
  cleaned: string,
  raw: string,
  company: string
) {
  if (!cleaned || looksLikeOpaqueIdentifier(raw) || looksLikeOpaqueIdentifier(cleaned)) {
    return false;
  }

  const normalizedCompany = company.trim().toLowerCase();
  const normalizedCleaned = cleaned.trim().toLowerCase();

  if (normalizedCompany && normalizedCleaned === normalizedCompany) {
    return false;
  }

  const tokens = normalizedCleaned
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token));

  if (tokens.length === 0) {
    return false;
  }

  if (hasRoleSignal(normalizedCleaned)) {
    return true;
  }

  if (tokens.length >= 2) {
    return true;
  }

  return tokens.some((token) => token.length >= 6 && !looksLikeOpaqueIdentifier(token));
}

function getTitle(url: URL, company: string) {
  const explicit =
    url.searchParams.get("title") ??
    url.searchParams.get("job_title") ??
    url.searchParams.get("position") ??
    url.searchParams.get("role");

  if (explicit) {
    return {
      title: titleCase(cleanSegment(explicit)),
      reliable: true,
    };
  }

  const hostLabel = pickDomainLabel(url.hostname);
  const rawParts = url.pathname.split("/").filter(Boolean);
  const titleParts =
    ATS_HOSTS.has(hostLabel) && rawParts.length > 1 ? rawParts.slice(1) : rawParts;

  const candidates = titleParts
    .map((part) => ({
      raw: part,
      cleaned: cleanSegment(part),
    }))
    .reverse();

  const selected = candidates.find((candidate) =>
    isMeaningfulTitleSegment(candidate.cleaned, candidate.raw, company)
  );

  if (!selected) {
    return {
      title: REVIEW_TITLE,
      reliable: false,
    };
  }

  const cleaned = selected.cleaned
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token.toLowerCase()))
    .join(" ");

  return {
    title: titleCase(cleaned || selected.cleaned),
    reliable: true,
  };
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

  return LOCATION_NOT_LISTED;
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

  if (
    normalizedSource.includes("greenhouse") ||
    normalizedSource.includes("lever") ||
    normalizedSource.includes("ashbyhq")
  ) {
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
  const titleResult = getTitle(url, company);
  const location = getLocation(url);
  const salary = getSalary(url);
  const tags = getTags(company, titleResult.title, location, source);

  const confidence = clamp(
    0.3 +
      (company ? 0.16 : 0) +
      (titleResult.reliable ? 0.24 : 0.02) +
      (location !== LOCATION_NOT_LISTED ? 0.12 : 0) +
      (salary ? 0.08 : 0) +
      (tags.length > 0 ? 0.06 : 0) -
      (titleResult.reliable ? 0 : 0.16),
    0.34,
    0.96
  );

  const notes = titleResult.reliable
    ? `Imported from ${source}. Review the parsed fields before saving.`
    : `Imported from ${source}. The URL did not reveal a reliable role title, so review the parsed fields before saving.`;

  return {
    url: url.toString(),
    company,
    title: titleResult.title,
    location,
    salary,
    source,
    notes,
    tags,
    status: "Applied",
    confidence,
    parseConfidence: confidence,
    fitSummary: "",
    jobDescription: "",
  };
}
