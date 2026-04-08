import type { ResumeProfile } from "$lib/types";

const SKILL_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: "JavaScript", pattern: /\bjavascript\b/i },
  { label: "TypeScript", pattern: /\btypescript\b/i },
  { label: "Python", pattern: /\bpython\b/i },
  { label: "Go", pattern: /\bgolang\b|\bgo\b/i },
  { label: "Rust", pattern: /\brust\b/i },
  { label: "Java", pattern: /\bjava\b/i },
  { label: "C++", pattern: /\bc\+\+\b/i },
  { label: "React", pattern: /\breact\b/i },
  { label: "Svelte", pattern: /\bsvelte\b/i },
  { label: "Next.js", pattern: /\bnext\.?js\b/i },
  { label: "Node.js", pattern: /\bnode\.?js\b/i },
  { label: "Express", pattern: /\bexpress\b/i },
  { label: "PostgreSQL", pattern: /\bpostgres(?:ql)?\b/i },
  { label: "MySQL", pattern: /\bmysql\b/i },
  { label: "SQLite", pattern: /\bsqlite\b/i },
  { label: "MongoDB", pattern: /\bmongodb\b/i },
  { label: "Redis", pattern: /\bredis\b/i },
  { label: "Docker", pattern: /\bdocker\b/i },
  { label: "Kubernetes", pattern: /\bkubernetes\b|\bk8s\b/i },
  { label: "AWS", pattern: /\baws\b|\bamazon web services\b/i },
  { label: "GCP", pattern: /\bgcp\b|\bgoogle cloud\b/i },
  { label: "Azure", pattern: /\bazure\b/i },
  { label: "GraphQL", pattern: /\bgraphql\b/i },
  { label: "REST APIs", pattern: /\brest(?:ful)?\b|\bapi\b/i },
  { label: "Tailwind", pattern: /\btailwind\b/i },
  { label: "CSS", pattern: /\bcss\b/i },
  { label: "HTML", pattern: /\bhtml\b/i },
  { label: "Figma", pattern: /\bfigma\b/i },
  { label: "Product Sense", pattern: /\bproduct\b/i },
  { label: "Leadership", pattern: /\bleadership\b|\bmentor(?:ing)?\b/i },
  { label: "Communication", pattern: /\bcommunication\b|\bstakeholder\b/i },
];

function cleanResumeText(rawText: string) {
  return rawText.replace(/\r/g, "").replace(/\u0000/g, "").trim();
}

export function createEmptyResumeProfile(): ResumeProfile {
  return {
    rawText: "",
    skills: [],
    summary: "",
    updatedAt: null,
  };
}

export function createResumeProfile(rawText: string): ResumeProfile {
  const normalized = cleanResumeText(rawText);

  if (!normalized) {
    return createEmptyResumeProfile();
  }

  const skills = SKILL_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(
    ({ label }) => label
  );
  const leadingSkills = skills.slice(0, 6);
  const summary = leadingSkills.length
    ? `Tracking ${skills.length} resume skill${skills.length === 1 ? "" : "s"}, led by ${leadingSkills.join(", ")}.`
    : "Resume profile saved locally and ready for fit scoring.";

  return {
    rawText: normalized,
    skills,
    summary,
    updatedAt: Date.now(),
  };
}
