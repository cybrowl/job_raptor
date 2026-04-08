import { describe, expect, it } from "vitest";
import { parseJobUrl } from "./parse-job";

describe("parseJobUrl", () => {
  it("throws for an invalid url", () => {
    expect(() => parseJobUrl("not-a-url")).toThrow("Enter a valid job URL.");
  });

  it("uses the company query parameter when present", () => {
    const parsed = parseJobUrl(
      "https://jobs.example.com/apply?company=acme-labs&title=staff-product-designer"
    );

    expect(parsed.company).toBe("Acme Labs");
  });

  it("uses organization query hints for company", () => {
    const parsed = parseJobUrl(
      "https://jobs.example.com/apply?organization=orbital-works&title=software-engineer"
    );

    expect(parsed.company).toBe("Orbital Works");
  });

  it("extracts greenhouse company slugs", () => {
    const parsed = parseJobUrl(
      "https://boards.greenhouse.io/notion/jobs/1234567/senior-product-designer"
    );

    expect(parsed.company).toBe("Notion");
  });

  it("falls back to the primary domain label for generic hosts", () => {
    const parsed = parseJobUrl("https://careers.vercel.com/platform-engineer");

    expect(parsed.company).toBe("Vercel");
  });

  it("uses the first path segment for linkedin style urls", () => {
    const parsed = parseJobUrl("https://linkedin.com/company/acme/jobs/view/1234");

    expect(parsed.company).toBe("Acme");
  });

  it("uses the title query parameter when present", () => {
    const parsed = parseJobUrl(
      "https://jobs.example.com/apply?title=staff-software-engineer"
    );

    expect(parsed.title).toBe("Staff Software Engineer");
  });

  it("uses the job_title query parameter when present", () => {
    const parsed = parseJobUrl(
      "https://jobs.example.com/apply?job_title=senior-data-scientist"
    );

    expect(parsed.title).toBe("Senior Data Scientist");
  });

  it("uses the role query parameter when present", () => {
    const parsed = parseJobUrl("https://jobs.example.com/apply?role=ui-ux-designer");

    expect(parsed.title).toBe("UI UX Designer");
  });

  it("parses lever title slugs from the path", () => {
    const parsed = parseJobUrl(
      "https://jobs.lever.co/figma/senior-software-engineer-platform"
    );

    expect(parsed.title).toBe("Senior Software Engineer Platform");
  });

  it("does not accept ashby opaque ids as titles", () => {
    const parsed = parseJobUrl(
      "https://jobs.ashbyhq.com/beaconai/f0861ba2-2e48-4c49-819c-e585b4bb655c"
    );

    expect(parsed.title).toBe("Review Role Title");
  });

  it("drops confidence when the title is only an opaque id", () => {
    const parsed = parseJobUrl(
      "https://jobs.ashbyhq.com/beaconai/f0861ba2-2e48-4c49-819c-e585b4bb655c"
    );

    expect(parsed.confidence).toBeLessThan(0.5);
  });

  it("parses ashby slugs when the title is actually present", () => {
    const parsed = parseJobUrl(
      "https://jobs.ashbyhq.com/beaconai/founding-ai-engineer"
    );

    expect(parsed.title).toBe("Founding AI Engineer");
  });

  it("strips stop words from path-derived titles", () => {
    const parsed = parseJobUrl(
      "https://careers.example.com/jobs/view/staff-product-manager"
    );

    expect(parsed.title).toBe("Staff Product Manager");
  });

  it("splits camelCase path segments into readable titles", () => {
    const parsed = parseJobUrl("https://careers.example.com/seniorSoftwareEngineer");

    expect(parsed.title).toBe("Senior Software Engineer");
  });

  it("preserves ai acronyms in uppercase", () => {
    const parsed = parseJobUrl("https://careers.example.com/applied-ai-engineer");

    expect(parsed.title).toBe("Applied AI Engineer");
  });

  it("preserves ios acronyms in uppercase", () => {
    const parsed = parseJobUrl("https://careers.example.com/ios-engineer");

    expect(parsed.title).toBe("IOS Engineer");
  });

  it("uses the location query parameter when present", () => {
    const parsed = parseJobUrl(
      "https://careers.example.com/role?location=san-francisco-ca"
    );

    expect(parsed.location).toBe("San Francisco Ca");
  });

  it("uses the loc query parameter when present", () => {
    const parsed = parseJobUrl("https://careers.example.com/role?loc=new-york-ny");

    expect(parsed.location).toBe("New York Ny");
  });

  it("uses the city query parameter when present", () => {
    const parsed = parseJobUrl("https://careers.example.com/role?city=austin-tx");

    expect(parsed.location).toBe("Austin Tx");
  });

  it("detects remote roles from the path", () => {
    const parsed = parseJobUrl("https://careers.example.com/senior-product-manager-remote");

    expect(parsed.location).toBe("Remote");
  });

  it("detects hybrid roles from the path", () => {
    const parsed = parseJobUrl("https://careers.example.com/platform-engineer-hybrid");

    expect(parsed.location).toBe("Hybrid");
  });

  it("detects on-site roles from the path", () => {
    const parsed = parseJobUrl("https://careers.example.com/security-engineer-on-site");

    expect(parsed.location).toBe("On-site");
  });

  it("uses salary query parameters when present", () => {
    const parsed = parseJobUrl(
      "https://careers.example.com/role?salary=$180K-$220K"
    );

    expect(parsed.salary).toBe("$180K $220K");
  });

  it("extracts salary ranges from the url body", () => {
    const parsed = parseJobUrl(
      "https://careers.example.com/senior-engineer-$180K-$220K-remote"
    );

    expect(parsed.salary).toBe("$180K-$220K");
  });

  it("adds a remote tag when the location is remote", () => {
    const parsed = parseJobUrl("https://careers.example.com/senior-engineer-remote");

    expect(parsed.tags).toContain("remote");
  });

  it("adds senior and engineering tags from the title", () => {
    const parsed = parseJobUrl("https://careers.example.com/staff-software-engineer");

    expect(parsed.tags).toEqual(expect.arrayContaining(["senior", "engineering"]));
  });

  it("adds a product tag from the title", () => {
    const parsed = parseJobUrl("https://careers.example.com/principal-product-manager");

    expect(parsed.tags).toContain("product");
  });

  it("adds a design tag from the title", () => {
    const parsed = parseJobUrl("https://careers.example.com/senior-product-design-lead");

    expect(parsed.tags).toContain("design");
  });

  it("adds a linkedin tag when the source is linkedin", () => {
    const parsed = parseJobUrl(
      "https://www.linkedin.com/company/acme/jobs/view/1234?title=senior-recruiter"
    );

    expect(parsed.tags).toContain("linkedin");
  });

  it("adds a direct tag for greenhouse", () => {
    const parsed = parseJobUrl(
      "https://boards.greenhouse.io/linear/jobs/1234567/staff-designer"
    );

    expect(parsed.tags).toContain("direct");
  });

  it("adds a direct tag for lever", () => {
    const parsed = parseJobUrl("https://jobs.lever.co/vercel/product-analyst");

    expect(parsed.tags).toContain("direct");
  });

  it("adds a direct tag for ashby", () => {
    const parsed = parseJobUrl("https://jobs.ashbyhq.com/raycast/product-engineer");

    expect(parsed.tags).toContain("direct");
  });

  it("slugifies the company name into a company tag", () => {
    const parsed = parseJobUrl(
      "https://jobs.example.com/apply?company=acme-labs&title=designer"
    );

    expect(parsed.tags).toContain("acme-labs");
  });

  it("keeps notes reassuring when the title is reliable", () => {
    const parsed = parseJobUrl("https://careers.example.com/founding-engineer");

    expect(parsed.notes).toContain("Review the parsed fields before saving.");
    expect(parsed.notes).not.toContain("did not reveal a reliable role title");
  });

  it("warns in notes when the title still needs review", () => {
    const parsed = parseJobUrl(
      "https://jobs.ashbyhq.com/beaconai/f0861ba2-2e48-4c49-819c-e585b4bb655c"
    );

    expect(parsed.notes).toContain("did not reveal a reliable role title");
  });

  it("strips www from the stored source", () => {
    const parsed = parseJobUrl(
      "https://www.linkedin.com/company/acme/jobs/view/1234?title=designer"
    );

    expect(parsed.source).toBe("linkedin.com");
  });

  it("gives higher confidence to reliable titles than placeholder titles", () => {
    const reliable = parseJobUrl("https://careers.example.com/founding-engineer");
    const placeholder = parseJobUrl(
      "https://jobs.ashbyhq.com/beaconai/f0861ba2-2e48-4c49-819c-e585b4bb655c"
    );

    expect(reliable.confidence).toBeGreaterThan(placeholder.confidence);
  });
});
