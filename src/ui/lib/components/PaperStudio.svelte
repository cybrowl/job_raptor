<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import {
    buildPaperResumeLayout,
    exportPaperLayoutToPdf,
    type PaperLayoutResult,
  } from "$lib/paper";

  export let draftText = "";
  export let savedResumeText = "";
  export let statusMessage = "";

  const dispatch = createEventDispatcher<{
    savedraft: { rawText: string };
  }>();

  let layout: PaperLayoutResult | null = null;
  let layoutBusy = false;
  let layoutError = "";
  let exportBusy = false;
  let exportStatus = "";
  let layoutTimer: ReturnType<typeof setTimeout> | null = null;
  let latestLayoutRun = 0;

  $: if (typeof window !== "undefined") {
    scheduleLayout(draftText);
  }
  $: fitLabel = getFitLabel(layout);
  $: helperMessage = exportStatus || statusMessage;

  onDestroy(() => {
    if (layoutTimer) {
      clearTimeout(layoutTimer);
    }
  });

  function scheduleLayout(text: string) {
    if (layoutTimer) {
      clearTimeout(layoutTimer);
      layoutTimer = null;
    }

    const normalized = text.trim();

    if (!normalized) {
      layout = null;
      layoutBusy = false;
      layoutError = "Paste a resume draft to build the one-page paper preview.";
      return;
    }

    layoutBusy = true;
    layoutError = "";
    const runId = ++latestLayoutRun;

    layoutTimer = setTimeout(async () => {
      try {
        const nextLayout = await buildPaperResumeLayout(normalized);

        if (runId !== latestLayoutRun) {
          return;
        }

        layout = nextLayout;
        layoutError = "";
      } catch (error) {
        if (runId !== latestLayoutRun) {
          return;
        }

        layout = null;
        layoutError = error instanceof Error ? error.message : "Unable to build the paper layout.";
      } finally {
        if (runId === latestLayoutRun) {
          layoutBusy = false;
        }
      }
    }, 140);
  }

  function getFitLabel(value: PaperLayoutResult | null) {
    if (!value) {
      return "Awaiting Draft";
    }

    if (!value.fits) {
      return `Still Over One Page • ${Math.round(value.scale * 100)}% Scale`;
    }

    if (value.scale >= 0.99) {
      return "Fits One Page";
    }

    return `Fits One Page • ${Math.round(value.scale * 100)}% Scale`;
  }

  function loadSavedResume() {
    if (!savedResumeText.trim()) {
      exportStatus = "Save a resume profile first if you want to load it into Paper.";
      return;
    }

    draftText = savedResumeText;
    exportStatus = "Loaded your saved resume profile into Paper.";
  }

  function saveDraft() {
    dispatch("savedraft", { rawText: draftText });
    exportStatus = "";
  }

  async function exportPdf() {
    if (!layout || !layout.fits) {
      return;
    }

    exportBusy = true;
    exportStatus = "";

    try {
      const result = await exportPaperLayoutToPdf(layout);

      if (result.cancelled) {
        exportStatus = "PDF export cancelled.";
        return;
      }

      exportStatus = `Exported paper resume to ${result.path}.`;
    } catch (error) {
      exportStatus = error instanceof Error ? error.message : "Unable to export the paper resume.";
    } finally {
      exportBusy = false;
    }
  }
</script>

<section class="panel">
  <div class="paper-studio">
    <div class="panel-grid paper-editor-panel">
      <div class="meta-row" style="justify-content: space-between; align-items: flex-start;">
        <div class="panel-grid" style="gap: 0.25rem;">
          <p class="eyebrow">Paper</p>
          <h2 class="title">One-Page Paper Studio</h2>
          <p class="body">
            Start blank, paste a cover letter or markdown resume, fit it to one page, and export a recruiter-ready PDF.
          </p>
        </div>
        <div class="panel-grid paper-fit-status">
          <span class:paper-fit-pill-warning={!layout?.fits} class="paper-fit-pill">
            {fitLabel}
          </span>
          {#if layout}
            <span class="meta-pill">
              {Math.round(layout.usedHeight)} / {Math.round(layout.availableHeight)} Pt
            </span>
          {/if}
        </div>
      </div>

      <div class="paper-action-row">
        <button
          type="button"
          class="ghost-button ghost-button-small"
          disabled={!savedResumeText.trim()}
          on:click={loadSavedResume}
        >
          Load Resume Profile
        </button>
        <button type="button" class="ghost-button ghost-button-small" on:click={saveDraft}>
          Save Draft
        </button>
        <button
          type="button"
          class="ghost-button ghost-button-small"
          disabled={exportBusy || layoutBusy || !layout || !layout.fits}
          on:click={exportPdf}
        >
          {exportBusy ? "Exporting" : "Export PDF"}
        </button>
      </div>

      <div class="field">
        <p class="field-label">Paper Draft</p>
        <textarea
          bind:value={draftText}
          rows="24"
          class="paper-editor-textarea"
          spellcheck="false"
          placeholder="Start with a blank page, then paste a cover letter or markdown resume here. Resume markdown works best when it keeps clear headings, entries, and bullets."
        ></textarea>
      </div>

      {#if helperMessage}
        <p class="micro">{helperMessage}</p>
      {/if}

      {#if layoutError}
        <p class="micro">{layoutError}</p>
      {/if}
    </div>

    <div class="panel-grid paper-preview-panel">
      <div class="meta-row" style="justify-content: space-between; align-items: center;">
        <div class="panel-grid" style="gap: 0.25rem;">
          <p class="field-label">Paper Preview</p>
          <p class="micro">
            This preview uses the same one-page layout model as the exported PDF.
          </p>
        </div>
        {#if layoutBusy}
          <span class="meta-pill">Reflowing</span>
        {/if}
      </div>

      <div class="paper-preview-shell">
        {#if layout}
          <div
            class="paper-preview-page"
            style={`width:${layout.pageWidth}px; height:${layout.pageHeight}px;`}
          >
            {#each layout.lines as line (line.id)}
              <div
                class="paper-preview-line"
                style={`left:${line.x}px; top:${line.y}px; width:${line.width}px; font-size:${line.fontSize}px; line-height:${line.lineHeight}px; font-weight:${line.fontWeight}; color:${line.color}; text-align:${line.align};`}
              >
                {line.text}
              </div>
            {/each}
          </div>
        {:else}
          <div class="paper-preview-empty">
            <p class="paper-preview-empty-title">Preview will appear here.</p>
            <p class="micro">
              Paste a cover letter or markdown resume on the left and Paper will fit it into a one-page export.
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</section>
