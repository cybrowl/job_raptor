<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { parseJobPosting } from "$lib/parser";
  import type { JobApplication, JobApplicationInput } from "$lib/types";
  import {
    fromDateInputValue,
    normalizeTagInput,
    toDateInputValue,
  } from "$lib/utils";

  export let open = false;
  export let application: JobApplication | null = null;
  export let seedInput: Partial<JobApplicationInput> | null = null;
  export let apiKey = "";
  export let model = "grok-4-fast-non-reasoning";
  export let resumeText = "";

  const dispatch = createEventDispatcher<{
    save: { id: number | null; input: JobApplicationInput };
  }>();

  let form: JobApplicationInput = createBlankInput();
  let appliedDateValue = toDateInputValue(Date.now());
  let tagsValue = "";
  let parseError = "";
  let isParsing = false;
  let parsedConfidence: number | null = null;
  let lastLoadedKey = "";

  function createBlankInput(): JobApplicationInput {
    return {
      url: "",
      company: "",
      title: "",
      location: "Remote",
      salary: null,
      appliedDate: Date.now(),
      status: "Applied",
      source: "manual",
      notes: "",
      tags: [],
      confidence: null,
      parseConfidence: null,
      fitSummary: "",
      jobDescription: "",
    };
  }

  function seedFromState(value: JobApplication | null, seed: Partial<JobApplicationInput> | null) {
    const base = value
      ? {
          url: value.url,
          company: value.company,
          title: value.title,
          location: value.location,
          salary: value.salary,
          appliedDate: value.appliedDate,
          status: value.status,
          source: value.source,
          notes: value.notes,
          tags: value.tags,
          confidence: value.confidence,
          parseConfidence: value.parseConfidence,
          fitSummary: value.fitSummary,
          jobDescription: value.jobDescription,
        }
      : {
          ...createBlankInput(),
          ...(seed ?? {}),
        };

    form = { ...base };
    appliedDateValue = toDateInputValue(base.appliedDate);
    tagsValue = base.tags.join(", ");
    parsedConfidence = base.confidence;
    parseError = "";
    isParsing = false;
  }

  $: modalKey = open
    ? `${application?.id ?? "new"}:${application?.lastUpdated ?? 0}:${seedInput?.url ?? ""}:${seedInput?.title ?? ""}`
    : "";
  $: if (open && modalKey !== lastLoadedKey) {
    seedFromState(application, seedInput);
    lastLoadedKey = modalKey;
  }
  $: if (!open) {
    lastLoadedKey = "";
  }

  async function parseUrl() {
    if (!form.url.trim()) {
      parseError = "Paste A Job Url Before Running The Parser.";
      return;
    }

    isParsing = true;
    parseError = "";

    try {
      const payload = await parseJobPosting(form.url, apiKey, model, resumeText);
      parsedConfidence = payload.confidence ?? parsedConfidence;
      form = {
        ...form,
        url: payload.url ?? form.url,
        company: payload.company ?? form.company,
        title: payload.title ?? form.title,
        location: payload.location ?? form.location,
        salary: payload.salary ?? form.salary,
        status: payload.status ?? form.status,
        source: payload.source ?? form.source,
        notes: form.notes || payload.notes || "",
        tags: payload.tags?.length ? payload.tags : form.tags,
        confidence: payload.confidence ?? form.confidence,
        parseConfidence: payload.parseConfidence ?? form.parseConfidence,
        fitSummary: payload.fitSummary ?? form.fitSummary,
        jobDescription: payload.jobDescription ?? form.jobDescription,
      };
      tagsValue = form.tags.join(", ");
    } catch (error) {
      parseError = error instanceof Error ? error.message : "Unknown Parsing Error.";
    } finally {
      isParsing = false;
    }
  }

  function save() {
    const nextInput: JobApplicationInput = {
      ...form,
      company: form.company.trim(),
      title: form.title.trim(),
      location: form.location.trim() || "Location Not Listed",
      salary: form.salary?.trim() ? form.salary.trim() : null,
      source: form.source.trim() || "manual",
      notes: form.notes.trim(),
      appliedDate: fromDateInputValue(appliedDateValue),
      tags: normalizeTagInput(tagsValue),
      confidence: parsedConfidence ?? form.confidence ?? null,
      parseConfidence: form.parseConfidence ?? null,
      fitSummary: form.fitSummary.trim(),
      jobDescription: form.jobDescription.trim(),
    };

    if (!nextInput.company || !nextInput.title) {
      parseError = "Company And Title Are Required Before Saving.";
      return;
    }

    dispatch("save", {
      id: application?.id ?? null,
      input: nextInput,
    });
  }
</script>

{#if open}
  <div
    class="modal-shell"
    role="dialog"
    aria-modal="true"
    aria-label={application ? "Edit application" : "Add application"}
    tabindex="0"
    on:click|self={() => (open = false)}
    on:keydown={(event) => {
      if (event.key === "Escape") {
        open = false;
      }
    }}
  >
    <div class="modal-panel">
      <div class="panel-grid">
        <div class="meta-row" style="justify-content: space-between;">
          <div class="panel-grid" style="gap: 0.25rem;">
            <p class="eyebrow">{application ? "Edit Application" : "Add Application"}</p>
            <h2 class="title">
              {application ? "Refine The Application Details" : "Bring A New Role Into The Pipeline"}
            </h2>
          </div>
          <button type="button" class="ghost-button" on:click={() => (open = false)}>
            Close
          </button>
        </div>

        <div class="panel-grid" style="grid-template-columns: minmax(0, 1fr) auto;">
          <div class="field">
            <p class="field-label">Job Url</p>
            <input
              bind:value={form.url}
              class="mono-input"
              placeholder="Paste A LinkedIn, Greenhouse, Lever, Or Careers Url"
            />
          </div>
          <div class="action-row" style="align-items: end;">
            <button
              type="button"
              class="ghost-button"
              disabled={isParsing}
              on:click={parseUrl}
            >
              {isParsing ? "Parsing" : "Ai Parse"}
            </button>
          </div>
        </div>

        <div class="meta-row">
          {#if (parsedConfidence ?? form.confidence) !== null}
            <span class="meta-pill">Fit Score {Math.round((parsedConfidence ?? form.confidence ?? 0) * 100)}%</span>
          {/if}
          {#if form.parseConfidence !== null}
            <span class="meta-pill">Parse Confidence {Math.round(form.parseConfidence * 100)}%</span>
          {/if}
          {#if parseError}
            <span class="meta-pill">{parseError}</span>
          {/if}
        </div>

        <div class="form-grid">
          <div class="field">
            <p class="field-label">Company</p>
            <input bind:value={form.company} class="mono-input" />
          </div>

          <div class="field">
            <p class="field-label">Title</p>
            <input bind:value={form.title} class="mono-input" />
          </div>

          <div class="field">
            <p class="field-label">Location</p>
            <input bind:value={form.location} class="mono-input" />
          </div>

          <div class="field">
            <p class="field-label">Salary</p>
            <input bind:value={form.salary} class="mono-input" placeholder="$180K - $220K" />
          </div>

          <div class="field">
            <p class="field-label">Source</p>
            <input bind:value={form.source} class="mono-input" />
          </div>

          <div class="field">
            <p class="field-label">Applied Date</p>
            <input bind:value={appliedDateValue} type="date" class="mono-input" />
          </div>

          <div class="field">
            <p class="field-label">Status</p>
            <select bind:value={form.status} class="mono-select">
              <option>Wishlist</option>
              <option>Applied</option>
              <option>Phone Screen</option>
              <option>Interview Loop</option>
              <option>Offer</option>
              <option>Rejected</option>
              <option>Archived</option>
            </select>
          </div>

          <div class="field">
            <p class="field-label">Tags</p>
            <input
              bind:value={tagsValue}
              class="mono-input"
              placeholder="Remote, Engineering, Referral"
            />
          </div>

          <div class="field form-span">
            <p class="field-label">Fit Summary</p>
            <textarea
              bind:value={form.fitSummary}
              rows="3"
              class="mono-textarea"
              placeholder="Saved match reasoning will appear here."
            ></textarea>
          </div>

          <div class="field form-span">
            <p class="field-label">Job Description</p>
            <textarea
              bind:value={form.jobDescription}
              rows="7"
              class="mono-textarea"
              placeholder="Saved job description text will appear here after parsing."
            ></textarea>
          </div>

          <div class="field form-span">
            <p class="field-label">Notes</p>
            <textarea
              bind:value={form.notes}
              rows="5"
              class="mono-textarea"
              placeholder="Store Follow-Up Notes, Interview Signals, Or Prep Reminders."
            ></textarea>
          </div>
        </div>

        <div class="action-row" style="justify-content: flex-end;">
          <button type="button" class="ghost-button" on:click={() => (open = false)}>
            Cancel
          </button>
          <button type="button" class="ghost-button" on:click={save}>
            {application ? "Save Changes" : "Save To Pipeline"}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  .form-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .form-span {
    grid-column: 1 / -1;
  }

  @media (max-width: 720px) {
    .form-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
