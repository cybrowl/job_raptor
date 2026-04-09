import { isTauriRuntime } from "$lib/runtime";

const PAPER_PAGE_WIDTH = 612;
const PAPER_PAGE_HEIGHT = 792;
const PAPER_PADDING = {
  top: 40,
  right: 42,
  bottom: 42,
  left: 42,
} as const;
const PAPER_BODY_COLOR = "#111111";
const MIN_LAYOUT_SCALE = 0.74;
const SCALE_STEP = 0.02;

type SectionKind = "summary" | "skills" | "experience" | "education" | "generic" | "letter";
type FontWeight = 400 | 700;

interface ExperienceEntry {
  title: string;
  dateRange: string;
  bullets: string[];
  notes: string[];
}

interface ResumeHeader {
  name: string;
  nameWeight: FontWeight;
  contactLines: string[];
}

interface ResumeSectionBase {
  title: string;
  kind: SectionKind;
}

interface ResumeSummarySection extends ResumeSectionBase {
  kind: "summary";
  paragraphs: string[];
}

interface ResumeSkillsSection extends ResumeSectionBase {
  kind: "skills";
  lines: string[];
}

interface ResumeExperienceSection extends ResumeSectionBase {
  kind: "experience";
  entries: ExperienceEntry[];
}

interface ResumeEducationSection extends ResumeSectionBase {
  kind: "education";
  lines: string[];
}

interface ResumeGenericSection extends ResumeSectionBase {
  kind: "generic";
  lines: string[];
}

interface ResumeLetterSection extends ResumeSectionBase {
  kind: "letter";
  paragraphs: string[];
}

type ResumeSection =
  | ResumeSummarySection
  | ResumeSkillsSection
  | ResumeExperienceSection
  | ResumeEducationSection
  | ResumeGenericSection
  | ResumeLetterSection;

interface ParsedResumeDocument {
  header: ResumeHeader;
  sections: ResumeSection[];
}

export interface PaperPreviewLine {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  lineHeight: number;
  fontWeight: FontWeight;
  align: "left" | "right";
  color: string;
}

export interface PaperLayoutResult {
  document: ParsedResumeDocument;
  lines: PaperPreviewLine[];
  fits: boolean;
  scale: number;
  usedHeight: number;
  availableHeight: number;
  overflow: number;
  pageWidth: number;
  pageHeight: number;
  padding: typeof PAPER_PADDING;
}

type PretextModule = typeof import("@chenglou/pretext");

let pretextPromise: Promise<PretextModule> | null = null;

function getPretext() {
  pretextPromise ??= import("@chenglou/pretext");
  return pretextPromise;
}

function normalizeResumeText(rawText: string) {
  return rawText
    .replace(/\r\n?/g, "\n")
    .replace(/\u2022/g, "•")
    .replace(/\t/g, "  ")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .trim();
}

function stripMarkdownInline(text: string) {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*/g, "$1$2")
    .replace(/(^|[^_])_(?!\s)(.+?)(?<!\s)_/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\\([#*_`[\]()])/g, "$1")
    .replace(/\s{2,}$/g, "")
    .trim();
}

function hasMarkdownStrongEmphasis(line: string) {
  return /^\s*(\*\*|__)(.+?)\1\s*$/.test(line.trim());
}

function getMarkdownHeading(line: string) {
  const match = line.match(/^(#{1,6})\s+(.+?)\s*$/);

  if (!match) {
    return null;
  }

  return {
    level: match[1].length,
    title: stripMarkdownInline(match[2]),
  };
}

function looksLikeMarkdownResume(normalized: string) {
  return /(^|\n)#{1,3}\s+\S/.test(normalized);
}

function looksLikeCoverLetter(normalized: string) {
  const trimmed = normalized.trim();

  if (!trimmed) {
    return false;
  }

  return (
    /(^|\n)\s*dear\b/i.test(trimmed) ||
    /(^|\n)\s*(best regards|regards|sincerely|thank you),?\s*$/im.test(trimmed) ||
    /(^|\n)\s*[A-Z][a-z]+ \d{1,2}, \d{4}\s*$/m.test(trimmed)
  );
}

function isSectionHeading(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 48 || /^[•-]/.test(trimmed)) {
    return false;
  }

  const alpha = trimmed.replace(/[^A-Za-z]/g, "");
  return alpha.length >= 6 && trimmed === trimmed.toUpperCase();
}

function cleanTextLine(line: string) {
  return line.replace(/\s+/g, " ").trim();
}

function splitBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = cleanTextLine(line);

    if (!trimmed) {
      if (current.length > 0) {
        blocks.push(current);
        current = [];
      }
      continue;
    }

    current.push(trimmed);
  }

  if (current.length > 0) {
    blocks.push(current);
  }

  return blocks;
}

function inferSectionKind(title: string): SectionKind {
  const normalized = title.trim().toUpperCase();

  if (normalized.includes("SUMMARY")) {
    return "summary";
  }

  if (normalized.includes("SKILL")) {
    return "skills";
  }

  if (normalized.includes("EXPERIENCE")) {
    return "experience";
  }

  if (normalized.includes("EDUCATION")) {
    return "education";
  }

  return "generic";
}

function isBulletLine(line: string) {
  return /^[-•]\s*/.test(line.trim());
}

function stripBullet(line: string) {
  return cleanTextLine(line.replace(/^[-•]\s*/, ""));
}

function splitTrailingDateRange(line: string) {
  const match = line.match(
    /^(.*?)(?:\s{2,}|\s+)((?:19|20)\d{2}\s*[–-]\s*(?:Present|Current|(?:19|20)\d{2}))$/i
  );

  if (!match) {
    return {
      title: cleanTextLine(line),
      dateRange: "",
    };
  }

  return {
    title: cleanTextLine(match[1]),
    dateRange: match[2].replace(/\s+/g, " ").trim(),
  };
}

function looksLikeDateRange(line: string) {
  return /(?:19|20)\d{2}\s*[–-]\s*(?:Present|Current|(?:19|20)\d{2})/i.test(line);
}

function parseMarkdownExperienceSection(
  title: string,
  lines: string[]
): ResumeExperienceSection {
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;

  const flush = () => {
    if (!current) {
      return;
    }

    entries.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const heading = getMarkdownHeading(rawLine);

    if (heading?.level === 3) {
      flush();
      current = {
        title: heading.title,
        dateRange: "",
        bullets: [],
        notes: [],
      };
      continue;
    }

    const line = stripMarkdownInline(rawLine);

    if (!line) {
      continue;
    }

    if (!current) {
      const { title: entryTitle, dateRange } = splitTrailingDateRange(line);
      current = {
        title: entryTitle,
        dateRange,
        bullets: [],
        notes: [],
      };
      continue;
    }

    if (isBulletLine(line)) {
      current.bullets.push(stripBullet(line));
      continue;
    }

    if (!current.dateRange && looksLikeDateRange(line)) {
      current.dateRange = line.replace(/\s+/g, " ").trim();
      continue;
    }

    current.notes.push(line);
  }

  flush();

  return {
    title,
    kind: "experience",
    entries,
  };
}

function parseMarkdownResume(normalized: string): ParsedResumeDocument {
  const lines = normalized.split("\n");
  const sections: ResumeSection[] = [];
  let headerName = "Your Name";
  let headerNameWeight: FontWeight = 400;
  const contactLines: string[] = [];
  let index = 0;

  while (index < lines.length && !stripMarkdownInline(lines[index])) {
    index += 1;
  }

  const firstHeading = index < lines.length ? getMarkdownHeading(lines[index]) : null;

  if (firstHeading?.level === 1) {
    headerName = firstHeading.title;
    headerNameWeight = 700;
    index += 1;
  } else if (index < lines.length) {
    headerName = stripMarkdownInline(lines[index]);
    headerNameWeight = hasMarkdownStrongEmphasis(lines[index]) ? 700 : 400;
    index += 1;
  }

  while (index < lines.length) {
    const heading = getMarkdownHeading(lines[index]);

    if (heading?.level === 2) {
      break;
    }

    const line = stripMarkdownInline(lines[index]);
    if (line) {
      contactLines.push(line);
    }

    index += 1;
  }

  while (index < lines.length) {
    const sectionHeading = getMarkdownHeading(lines[index]);

    if (!sectionHeading || sectionHeading.level !== 2) {
      index += 1;
      continue;
    }

    const title = sectionHeading.title;
    index += 1;
    const sectionLines: string[] = [];

    while (index < lines.length) {
      const nextHeading = getMarkdownHeading(lines[index]);

      if (nextHeading?.level === 2) {
        break;
      }

      sectionLines.push(lines[index]);
      index += 1;
    }

    const kind = inferSectionKind(title);

    if (kind === "experience") {
      sections.push(parseMarkdownExperienceSection(title, sectionLines));
      continue;
    }

    const cleanedLines = sectionLines
      .map((line) => stripMarkdownInline(line))
      .filter(Boolean);

    if (kind === "summary") {
      sections.push({
        title,
        kind,
        paragraphs: splitBlocks(cleanedLines).map((block) => block.join(" ")).filter(Boolean),
      });
      continue;
    }

    if (kind === "skills") {
      sections.push({
        title,
        kind,
        lines: cleanedLines,
      });
      continue;
    }

    if (kind === "education") {
      sections.push({
        title,
        kind,
        lines: cleanedLines,
      });
      continue;
    }

    sections.push({
      title,
      kind: "generic",
      lines: cleanedLines,
    });
  }

  return {
    header: {
      name: headerName,
      nameWeight: headerNameWeight,
      contactLines,
    },
    sections,
  };
}

function parseExperienceSection(title: string, lines: string[]): ResumeExperienceSection {
  const entries: ExperienceEntry[] = [];
  let currentLines: string[] = [];

  const flushEntry = () => {
    if (currentLines.length === 0) {
      return;
    }

    const [headerLine, ...rest] = currentLines;
    const { title: entryTitle, dateRange } = splitTrailingDateRange(headerLine);
    const bullets = rest.filter(isBulletLine).map(stripBullet);
    const notes = rest.filter((line) => !isBulletLine(line)).map(cleanTextLine);

    entries.push({
      title: entryTitle,
      dateRange,
      bullets,
      notes,
    });

    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = cleanTextLine(rawLine);

    if (!line) {
      flushEntry();
      continue;
    }

    if (currentLines.length === 0) {
      currentLines.push(line);
      continue;
    }

    if (!isBulletLine(line) && currentLines.slice(1).some(isBulletLine)) {
      flushEntry();
      currentLines.push(line);
      continue;
    }

    currentLines.push(line);
  }

  flushEntry();

  return {
    title,
    kind: "experience",
    entries,
  };
}

function buildSection(title: string, lines: string[]): ResumeSection {
  const kind = inferSectionKind(title);
  const blocks = splitBlocks(lines);

  switch (kind) {
    case "summary":
      return {
        title,
        kind,
        paragraphs: blocks.map((block) => block.join(" ")).filter(Boolean),
      };
    case "skills":
      return {
        title,
        kind,
        lines: lines.map(cleanTextLine).filter(Boolean),
      };
    case "experience":
      return parseExperienceSection(title, lines);
    case "education":
      return {
        title,
        kind,
        lines: lines.map(cleanTextLine).filter(Boolean),
      };
    default:
      return {
        title,
        kind: "generic",
        lines: lines.map(cleanTextLine).filter(Boolean),
      };
  }
}

export function parsePaperResume(rawText: string): ParsedResumeDocument {
  const normalized = normalizeResumeText(rawText);

  if (!normalized) {
    return {
      header: {
        name: "Your Name",
        nameWeight: 400,
        contactLines: ["Email • Phone • Portfolio"],
      },
      sections: [],
    };
  }

  if (looksLikeMarkdownResume(normalized)) {
    return parseMarkdownResume(normalized);
  }

  if (looksLikeCoverLetter(normalized)) {
    const blocks = splitBlocks(normalized.split("\n"));
    const headerBlock = blocks[0] ?? [];
    const header: ResumeHeader = {
      name: cleanTextLine(headerBlock[0] ?? "Your Name"),
      nameWeight: 400,
      contactLines: headerBlock.slice(1).map(cleanTextLine).filter(Boolean),
    };
    const paragraphs = blocks
      .slice(1)
      .map((block) => block.map(cleanTextLine).filter(Boolean).join(" "))
      .filter(Boolean);

    return {
      header,
      sections: paragraphs.length
        ? [
            {
              title: "",
              kind: "letter",
              paragraphs,
            },
          ]
        : [],
    };
  }

  const lines = normalized.split("\n");
  const firstHeadingIndex = lines.findIndex((line) => isSectionHeading(line));
  const headerLines = (firstHeadingIndex === -1 ? lines : lines.slice(0, firstHeadingIndex))
    .map(cleanTextLine)
    .filter(Boolean);
  const header: ResumeHeader = {
    name: headerLines[0] ?? "Your Name",
    nameWeight: 400,
    contactLines: headerLines.slice(1),
  };
  const sections: ResumeSection[] = [];

  if (firstHeadingIndex === -1) {
    sections.push({
      title: "Professional Summary",
      kind: "summary",
      paragraphs: splitBlocks(lines.slice(1)).map((block) => block.join(" ")).filter(Boolean),
    });

    return { header, sections };
  }

  let index = firstHeadingIndex;

  while (index < lines.length) {
    const heading = cleanTextLine(lines[index]);

    if (!heading) {
      index += 1;
      continue;
    }

    index += 1;
    const sectionLines: string[] = [];

    while (index < lines.length && !isSectionHeading(lines[index])) {
      sectionLines.push(lines[index]);
      index += 1;
    }

    sections.push(buildSection(heading, sectionLines));
  }

  return { header, sections };
}

interface LayoutTypography {
  name: { size: number; lineHeight: number; weight: FontWeight };
  contact: { size: number; lineHeight: number; weight: FontWeight };
  section: { size: number; lineHeight: number; weight: FontWeight };
  body: { size: number; lineHeight: number; weight: FontWeight };
  role: { size: number; lineHeight: number; weight: FontWeight };
  date: { size: number; lineHeight: number; weight: FontWeight };
  bullet: { size: number; lineHeight: number; weight: FontWeight };
}

function buildTypography(scale: number): LayoutTypography {
  return {
    name: { size: 24 * scale, lineHeight: 28 * scale, weight: 700 },
    contact: { size: 9.5 * scale, lineHeight: 12 * scale, weight: 400 },
    section: { size: 11.5 * scale, lineHeight: 14 * scale, weight: 700 },
    body: { size: 10.1 * scale, lineHeight: 13.2 * scale, weight: 400 },
    role: { size: 10.4 * scale, lineHeight: 12.8 * scale, weight: 700 },
    date: { size: 10 * scale, lineHeight: 12.8 * scale, weight: 700 },
    bullet: { size: 9.7 * scale, lineHeight: 12.4 * scale, weight: 400 },
  };
}

function makeFont(size: number, weight: FontWeight) {
  return `${weight === 700 ? 700 : 400} ${size}px Arial`;
}

function makeLineId() {
  return `${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

async function buildLayoutAtScale(
  document: ParsedResumeDocument,
  scale: number,
  pretext: PretextModule
): Promise<PaperLayoutResult> {
  const { prepareWithSegments, layoutWithLines, measureNaturalWidth } = pretext;
  const typography = buildTypography(scale);
  const isLetterDocument =
    document.sections.length > 0 && document.sections.every((section) => section.kind === "letter");
  const headerNameStyle = isLetterDocument
    ? {
        size: typography.body.size,
        lineHeight: typography.body.lineHeight,
      }
    : {
        size: typography.name.size,
        lineHeight: typography.name.lineHeight,
      };
  const contentWidth = PAPER_PAGE_WIDTH - PAPER_PADDING.left - PAPER_PADDING.right;
  const availableHeight = PAPER_PAGE_HEIGHT - PAPER_PADDING.top - PAPER_PADDING.bottom;
  const lines: PaperPreviewLine[] = [];
  const preparedCache = new Map<string, ReturnType<typeof prepareWithSegments>>();
  let cursorY = PAPER_PADDING.top;

  const getPrepared = (
    text: string,
    font: string,
    options?: { whiteSpace?: "normal" | "pre-wrap"; wordBreak?: "normal" | "keep-all" }
  ) => {
    const cacheKey = `${font}::${options?.whiteSpace ?? "normal"}::${options?.wordBreak ?? "normal"}::${text}`;
    const existing = preparedCache.get(cacheKey);

    if (existing) {
      return existing;
    }

    const prepared = prepareWithSegments(text, font, options);
    preparedCache.set(cacheKey, prepared);
    return prepared;
  };

  const measureWidth = (text: string, font: string) => {
    const prepared = getPrepared(text, font);
    return measureNaturalWidth(prepared);
  };

  const wrapText = (
    text: string,
    fontSize: number,
    fontWeight: FontWeight,
    maxWidth: number,
    lineHeight: number,
    options?: { whiteSpace?: "normal" | "pre-wrap"; wordBreak?: "normal" | "keep-all" }
  ) => {
    const prepared = getPrepared(text, makeFont(fontSize, fontWeight), options);
    return layoutWithLines(prepared, maxWidth, lineHeight);
  };

  const pushWrapped = (
    text: string,
    config: { x: number; width: number; fontSize: number; fontWeight: FontWeight; lineHeight: number }
  ) => {
    const wrapped = wrapText(
      text,
      config.fontSize,
      config.fontWeight,
      config.width,
      config.lineHeight
    );

    for (const line of wrapped.lines) {
      lines.push({
        id: makeLineId(),
        text: line.text,
        x: config.x,
        y: cursorY,
        width: config.width,
        fontSize: config.fontSize,
        lineHeight: config.lineHeight,
        fontWeight: config.fontWeight,
        align: "left",
        color: PAPER_BODY_COLOR,
      });
      cursorY += config.lineHeight;
    }
  };

  pushWrapped(document.header.name, {
    x: PAPER_PADDING.left,
    width: contentWidth,
    fontSize: headerNameStyle.size,
    fontWeight: document.header.nameWeight,
    lineHeight: headerNameStyle.lineHeight,
  });

  if (document.header.contactLines.length > 0) {
    cursorY += 4 * scale;
    for (const line of document.header.contactLines) {
      pushWrapped(line, {
        x: PAPER_PADDING.left,
        width: contentWidth,
        fontSize: typography.contact.size,
        fontWeight: typography.contact.weight,
        lineHeight: typography.contact.lineHeight,
      });
    }
  }

  cursorY += 10 * scale;

  for (const section of document.sections) {
    if (section.title.trim()) {
      pushWrapped(section.title, {
        x: PAPER_PADDING.left,
        width: contentWidth,
        fontSize: typography.section.size,
        fontWeight: typography.section.weight,
        lineHeight: typography.section.lineHeight,
      });
      cursorY += 4 * scale;
    }

    if (section.kind === "summary" || section.kind === "letter") {
      for (const paragraph of section.paragraphs) {
        pushWrapped(paragraph, {
          x: PAPER_PADDING.left,
          width: contentWidth,
          fontSize: typography.body.size,
          fontWeight: typography.body.weight,
          lineHeight: typography.body.lineHeight,
        });
        cursorY += 4 * scale;
      }
    } else if (section.kind === "skills") {
      for (const skillLine of section.lines) {
        pushWrapped(skillLine, {
          x: PAPER_PADDING.left,
          width: contentWidth,
          fontSize: typography.body.size,
          fontWeight: typography.body.weight,
          lineHeight: typography.body.lineHeight,
        });
      }
      cursorY += 4 * scale;
    } else if (section.kind === "experience") {
      for (const entry of section.entries) {
        const dateWidth = entry.dateRange
          ? measureWidth(entry.dateRange, makeFont(typography.date.size, typography.date.weight))
          : 0;
        const roleWidth = entry.dateRange
          ? Math.max(120 * scale, contentWidth - dateWidth - 14 * scale)
          : contentWidth;
        const roleLines = wrapText(
          entry.title,
          typography.role.size,
          typography.role.weight,
          roleWidth,
          typography.role.lineHeight
        ).lines;

        for (let index = 0; index < roleLines.length; index += 1) {
          const roleLine = roleLines[index];
          lines.push({
            id: makeLineId(),
            text: roleLine.text,
            x: PAPER_PADDING.left,
            y: cursorY,
            width: roleWidth,
            fontSize: typography.role.size,
            lineHeight: typography.role.lineHeight,
            fontWeight: typography.role.weight,
            align: "left",
            color: PAPER_BODY_COLOR,
          });

          if (index === 0 && entry.dateRange) {
            lines.push({
              id: makeLineId(),
              text: entry.dateRange,
              x: PAPER_PADDING.left + contentWidth - dateWidth,
              y: cursorY,
              width: dateWidth,
              fontSize: typography.date.size,
              lineHeight: typography.date.lineHeight,
              fontWeight: typography.date.weight,
              align: "left",
              color: PAPER_BODY_COLOR,
            });
          }

          cursorY += typography.role.lineHeight;
        }

        for (const note of entry.notes) {
          pushWrapped(note, {
            x: PAPER_PADDING.left,
            width: contentWidth,
            fontSize: typography.body.size,
            fontWeight: typography.body.weight,
            lineHeight: typography.body.lineHeight,
          });
        }

        const bulletAnchorX = PAPER_PADDING.left + 2 * scale;
        const bulletTextX = PAPER_PADDING.left + 14 * scale;
        const bulletWidth = contentWidth - (bulletTextX - PAPER_PADDING.left);

        for (const bullet of entry.bullets) {
          const bulletLines = wrapText(
            bullet,
            typography.bullet.size,
            typography.bullet.weight,
            bulletWidth,
            typography.bullet.lineHeight
          ).lines;

          bulletLines.forEach((bulletLine, index) => {
            if (index === 0) {
              lines.push({
                id: makeLineId(),
                text: "•",
                x: bulletAnchorX,
                y: cursorY,
                width: 8 * scale,
                fontSize: typography.bullet.size,
                lineHeight: typography.bullet.lineHeight,
                fontWeight: typography.bullet.weight,
                align: "left",
                color: PAPER_BODY_COLOR,
              });
            }

            lines.push({
              id: makeLineId(),
              text: bulletLine.text,
              x: bulletTextX,
              y: cursorY,
              width: bulletWidth,
              fontSize: typography.bullet.size,
              lineHeight: typography.bullet.lineHeight,
              fontWeight: typography.bullet.weight,
              align: "left",
              color: PAPER_BODY_COLOR,
            });

            cursorY += typography.bullet.lineHeight;
          });
        }

        cursorY += 6 * scale;
      }
    } else {
      for (const line of section.lines) {
        pushWrapped(line, {
          x: PAPER_PADDING.left,
          width: contentWidth,
          fontSize: typography.body.size,
          fontWeight: typography.body.weight,
          lineHeight: typography.body.lineHeight,
        });
      }
      cursorY += 4 * scale;
    }

    cursorY += 8 * scale;
  }

  const usedHeight = cursorY - PAPER_PADDING.top;
  const overflow = Math.max(0, usedHeight - availableHeight);

  return {
    document,
    lines,
    fits: overflow <= 0.5,
    scale,
    usedHeight,
    availableHeight,
    overflow,
    pageWidth: PAPER_PAGE_WIDTH,
    pageHeight: PAPER_PAGE_HEIGHT,
    padding: PAPER_PADDING,
  };
}

export async function buildPaperResumeLayout(rawText: string) {
  const document = parsePaperResume(rawText);
  const pretext = await getPretext();

  let scale = 1;
  let best = await buildLayoutAtScale(document, scale, pretext);

  while (!best.fits && scale > MIN_LAYOUT_SCALE) {
    scale = Number((scale - SCALE_STEP).toFixed(2));
    best = await buildLayoutAtScale(document, scale, pretext);
  }

  return best;
}

function createPaperFilename(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "resume"}-paper.pdf`;
}

export async function exportPaperLayoutToPdf(layout: PaperLayoutResult) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "letter",
    compress: true,
  });

  const normalizeExportText = (text: string) =>
    text
      .replace(/[–—]/g, "-")
      .replace(/[•]/g, "-")
      .replace(/[’]/g, "'")
      .replace(/[“”]/g, '"');

  for (const line of layout.lines) {
    doc.setFont("helvetica", line.fontWeight === 700 ? "bold" : "normal");
    doc.setFontSize(line.fontSize);
    doc.setTextColor(PAPER_BODY_COLOR);
    doc.text(normalizeExportText(line.text), line.x, line.y + line.fontSize * 0.86);
  }

  const filename = createPaperFilename(layout.document.header.name);

  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const bytes = Array.from(new Uint8Array(doc.output("arraybuffer")));
    const path = await invoke<string | null>("export_paper_pdf", {
      bytes,
      suggestedFilename: filename,
    });

    if (!path) {
      return { cancelled: true as const };
    }

    return {
      cancelled: false as const,
      path,
    };
  }

  doc.save(filename);

  return {
    cancelled: false as const,
    path: filename,
  };
}
