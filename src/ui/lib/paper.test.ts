import { describe, expect, it } from "vitest";
import { parsePaperResume } from "./paper";

const SAMPLE_RESUME = `
Jefri Vanegas
(213) 822-4331 | vjefri@gmail.com
github.com/cybrowl | linkedin.com/in/vjefri

PROFESSIONAL SUMMARY
Senior Software Engineer with 9+ years architecting scalable frontend and full-stack applications.

TECHNICAL SKILLS
Frontend: React, SvelteKit, Tailwind CSS
Backend: Node.js, Spring Boot

PROFESSIONAL EXPERIENCE
Software Engineer — CodeGov (Internet Computer / DFINITY)          2024 – 2026
- Led security and performance code reviews across 12+ critical repositories.
- Established security review frameworks across the ecosystem.

Co-Founder & Software Engineer — DSign                             2022 – 2024
- Co-founded collaborative design software that enabled designers to discover and share.

EDUCATION
Advanced Software Engineering Immersive Program — Hack Reactor, 2015
Bachelor of Arts in Psychology, Minor in Cognitive Science — University of California, Los Angeles, 2011
`;

const MARKDOWN_RESUME = `
# Jefri Vanegas

**(213) 822-4331** | **vjefri@gmail.com**
**GitHub:** github.com/cybrowl | **LinkedIn:** linkedin.com/in/vjefri

## Professional Summary
Senior Software Engineer with 9+ years architecting scalable frontend and full-stack applications.

## Technical Skills
**Frontend:** React, Svelte, SvelteKit
**Backend:** Node.js, Spring Boot

## Professional Experience

### Software Engineer - CodeGov (Internet Computer / DFINITY)
*2024 - 2026*
- Led security and performance code reviews across 12+ repositories.
- Established security review frameworks across the ecosystem.

### Co-Founder & Software Engineer - DSign
*2022 - 2024*
- Co-founded collaborative design software for designers.

## Education
Advanced Software Engineering Immersive Program - Hack Reactor, 2015
`;

describe("parsePaperResume", () => {
  it("extracts the resume header", () => {
    const parsed = parsePaperResume(SAMPLE_RESUME);

    expect(parsed.header.name).toBe("Jefri Vanegas");
    expect(parsed.header.contactLines).toEqual([
      "(213) 822-4331 | vjefri@gmail.com",
      "github.com/cybrowl | linkedin.com/in/vjefri",
    ]);
  });

  it("parses experience entries and date ranges", () => {
    const parsed = parsePaperResume(SAMPLE_RESUME);
    const experience = parsed.sections.find((section) => section.kind === "experience");

    expect(experience?.kind).toBe("experience");

    if (!experience || experience.kind !== "experience") {
      throw new Error("Expected an experience section.");
    }

    expect(experience.entries).toHaveLength(2);
    expect(experience.entries[0]?.title).toContain("CodeGov");
    expect(experience.entries[0]?.dateRange).toBe("2024 – 2026");
    expect(experience.entries[0]?.bullets[0]).toContain("performance code reviews");
  });

  it("keeps skills and education as line-based sections", () => {
    const parsed = parsePaperResume(SAMPLE_RESUME);
    const skills = parsed.sections.find((section) => section.kind === "skills");
    const education = parsed.sections.find((section) => section.kind === "education");

    expect(skills?.kind).toBe("skills");
    expect(education?.kind).toBe("education");

    if (!skills || skills.kind !== "skills" || !education || education.kind !== "education") {
      throw new Error("Expected skills and education sections.");
    }

    expect(skills.lines[0]).toBe("Frontend: React, SvelteKit, Tailwind CSS");
    expect(education.lines[0]).toContain("Hack Reactor");
  });

  it("parses markdown resumes without duplicating header content", () => {
    const parsed = parsePaperResume(MARKDOWN_RESUME);

    expect(parsed.header.name).toBe("Jefri Vanegas");
    expect(parsed.header.contactLines).toEqual([
      "(213) 822-4331 | vjefri@gmail.com",
      "GitHub: github.com/cybrowl | LinkedIn: linkedin.com/in/vjefri",
    ]);

    const summary = parsed.sections.find((section) => section.kind === "summary");
    expect(summary?.kind).toBe("summary");

    if (!summary || summary.kind !== "summary") {
      throw new Error("Expected a summary section.");
    }

    expect(summary.paragraphs).toHaveLength(1);
    expect(summary.paragraphs[0]).not.toContain("#");
    expect(summary.paragraphs[0]).toContain("Senior Software Engineer");
  });

  it("extracts markdown experience headings and italic date lines", () => {
    const parsed = parsePaperResume(MARKDOWN_RESUME);
    const experience = parsed.sections.find((section) => section.kind === "experience");

    expect(experience?.kind).toBe("experience");

    if (!experience || experience.kind !== "experience") {
      throw new Error("Expected an experience section.");
    }

    expect(experience.entries[0]?.title).toContain("CodeGov");
    expect(experience.entries[0]?.dateRange).toBe("2024 - 2026");
    expect(experience.entries[0]?.bullets[0]).toContain("performance code reviews");
  });
});
