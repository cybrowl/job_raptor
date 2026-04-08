<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import AddJobModal from "$lib/components/AddJobModal.svelte";
  import AnalyticsPanel from "$lib/components/AnalyticsPanel.svelte";
  import ApplicationsTable from "$lib/components/ApplicationsTable.svelte";
  import MetricCard from "$lib/components/MetricCard.svelte";
  import {
    exportBackupToFile,
    importBackupFromFile,
    loadLocalSettings,
    saveLocalSettings,
  } from "$lib/local/persistence";
  import { createEmptyResumeProfile, createResumeProfile } from "$lib/resume";
  import { getStorageDriverLabel, isTauriRuntime } from "$lib/runtime";
  import { parseJobPosting } from "$lib/parser";
  import { applicationsStore } from "$lib/stores/applications";
  import type { JobApplication, JobApplicationInput, ResumeProfile } from "$lib/types";
  import {
    buildRecentCountSeries,
    compareRecentPeriods,
    formatPercent,
    isActiveStatus,
  } from "$lib/utils";

  type WorkspaceView = "table" | "analytics" | "settings";
  type TrendDirection = "up" | "down" | "flat";

  interface ParseToast {
    id: number;
    title: string;
    body: string;
  }

  let showComposer = false;
  let editingApplication: JobApplication | null = null;
  let composerSeed: Partial<JobApplicationInput> | null = null;
  let activeView: WorkspaceView = "table";
  let quickUrl = "";
  let quickParseLoading = false;
  let quickParseError = "";
  let quickParseSummary = "";
  let xAiApiKeyDraft = "";
  let xAiModelDraft = "grok-4-fast-non-reasoning";
  let settingsStatus = "";
  let resumeProfile: ResumeProfile = createEmptyResumeProfile();
  let resumeTextDraft = "";
  let resumeStatus = "";
  let backupBusy = false;
  let backupStatus = "";
  let resyncingApplications = false;
  let parseToast: ParseToast | null = null;
  let parseToastTimer: ReturnType<typeof setTimeout> | null = null;

  const REVIEW_ROLE_TITLE = "Review Role Title";
  const UNKNOWN_COMPANY = "Unknown Company";
  const LOCATION_NOT_LISTED = "Location Not Listed";

  onMount(async () => {
    await Promise.all([applicationsStore.load(), loadParserSettings()]);
  });

  onDestroy(() => {
    clearParseToastTimer();
  });

  $: metrics = $applicationsStore.analytics;
  $: storageModeLabel = getStorageDriverLabel($applicationsStore.storage);
  $: recentCreatedSeries = toCumulative(
    buildRecentCountSeries($applicationsStore.items, (application) => application.createdAt)
  );
  $: recentActiveSeries = buildRecentCountSeries(
    $applicationsStore.items,
    (application) => application.lastUpdated,
    (application) => isActiveStatus(application.status)
  );
  $: recentAppliedSeries = buildRecentCountSeries(
    $applicationsStore.items,
    (application) => application.appliedDate
  );
  $: recentResponseSeries = buildRecentCountSeries(
    $applicationsStore.items,
    (application) => application.lastUpdated,
    (application) =>
      application.status !== "Wishlist" && application.status !== "Applied"
  );
  $: totalTrend = buildTrend(
    compareRecentPeriods($applicationsStore.items, (application) => application.createdAt),
    "new roles this week"
  );
  $: activeTrend = buildTrend(
    compareRecentPeriods(
      $applicationsStore.items,
      (application) => application.lastUpdated,
      (application) => isActiveStatus(application.status)
    ),
    "active touches this week"
  );
  $: appliedTrend = buildTrend(
    compareRecentPeriods($applicationsStore.items, (application) => application.appliedDate),
    "applications this week"
  );
  $: responseTrend = buildTrend(
    compareRecentPeriods(
      $applicationsStore.items,
      (application) => application.lastUpdated,
      (application) =>
        application.status !== "Wishlist" && application.status !== "Applied"
    ),
    "responses this week"
  );
  $: quickParseProvider = xAiApiKeyDraft.trim()
    ? isTauriRuntime()
      ? `Grok Parser • ${resumeProfile.rawText ? "Fit Scoring On" : xAiModelDraft}`
      : "Saved Grok Key"
    : "Heuristic Parser";

  function openCreate() {
    editingApplication = null;
    composerSeed = quickUrl.trim() ? { url: quickUrl.trim() } : null;
    showComposer = true;
  }

  function handleEdit(event: CustomEvent<JobApplication>) {
    editingApplication = event.detail;
    composerSeed = null;
    showComposer = true;
  }

  async function handleSave(
    event: CustomEvent<{
      id: number | null;
      input: Omit<JobApplication, "id" | "createdAt" | "lastUpdated">;
    }>
  ) {
    const { id, input } = event.detail;
    try {
      await applicationsStore.save(id, input);
      showComposer = false;
      editingApplication = null;
      composerSeed = null;
      if (id === null) {
        quickUrl = "";
      }
    } catch (error) {
      return;
    }
  }

  async function handleRemove(event: CustomEvent<{ id: number }>) {
    if (window.confirm("Delete this application from the pipeline?")) {
      try {
        await applicationsStore.remove(event.detail.id);
      } catch (error) {
        return;
      }
    }
  }

  async function handleStatusChange(event: CustomEvent<{ id: number; status: string }>) {
    try {
      await applicationsStore.setStatus(event.detail.id, event.detail.status);
    } catch (error) {
      return;
    }
  }

  function mergeTags(primary: string[], secondary: string[]) {
    const merged = new Set<string>();

    for (const tag of [...primary, ...secondary]) {
      const trimmed = tag.trim();
      if (trimmed) {
        merged.add(trimmed);
      }
    }

    return [...merged];
  }

  function preferTitle(current: string, next: string | undefined) {
    const trimmed = next?.trim() ?? "";
    if (!trimmed || trimmed === REVIEW_ROLE_TITLE) {
      return current;
    }

    return trimmed;
  }

  function preferCompany(current: string, next: string | undefined) {
    const trimmed = next?.trim() ?? "";
    if (!trimmed || trimmed === UNKNOWN_COMPANY) {
      return current;
    }

    return trimmed;
  }

  function preferLocation(current: string, next: string | undefined) {
    const trimmed = next?.trim() ?? "";
    if (!trimmed || trimmed.toLowerCase() === LOCATION_NOT_LISTED.toLowerCase()) {
      return current;
    }

    return trimmed;
  }

  function buildResyncedInput(
    application: JobApplication,
    payload: Awaited<ReturnType<typeof parseJobPosting>>
  ): JobApplicationInput {
    const nextFitSummary = payload.fitSummary?.trim() || application.fitSummary;
    const nextParseConfidence =
      payload.parseConfidence ?? payload.confidence ?? application.parseConfidence ?? null;
    const nextConfidence = nextFitSummary
      ? payload.confidence ?? application.confidence ?? nextParseConfidence
      : application.fitSummary
        ? application.confidence
        : payload.confidence ?? application.confidence ?? nextParseConfidence;

    return {
      url: payload.url?.trim() || application.url,
      company: preferCompany(application.company, payload.company),
      title: preferTitle(application.title, payload.title),
      location: preferLocation(application.location, payload.location),
      salary: payload.salary?.trim() ? payload.salary.trim() : application.salary,
      appliedDate: application.appliedDate,
      status: application.status,
      source: payload.source?.trim() || application.source,
      notes: application.notes.trim() || payload.notes?.trim() || "",
      tags: mergeTags(payload.tags ?? [], application.tags),
      confidence: nextConfidence,
      parseConfidence: nextParseConfidence,
      fitSummary: nextFitSummary,
      jobDescription: payload.jobDescription?.trim() || application.jobDescription,
    };
  }

  async function handleQuickParse() {
    if (!quickUrl.trim()) {
      quickParseError = "Paste A Job Url Before Running The Parser.";
      return;
    }

    const startedAt = performance.now();
    const submittedUrl = quickUrl.trim();
    quickParseLoading = true;
    quickParseError = "";
    quickParseSummary = "";

    try {
      const payload = await parseJobPosting(
        submittedUrl,
        xAiApiKeyDraft,
        xAiModelDraft,
        resumeProfile.rawText
      );
      const nextInput: JobApplicationInput = {
        url: payload.url?.trim() || submittedUrl,
        company: payload.company?.trim() || "Unknown Company",
        title: payload.title?.trim() || "Review Role Title",
        location: payload.location?.trim() || "Location Not Listed",
        salary: payload.salary?.trim() ? payload.salary.trim() : null,
        appliedDate: Date.now(),
        status: payload.status?.trim() || "Applied",
        source: payload.source?.trim() || "url parse",
        notes: payload.notes?.trim() || "Imported from URL parser.",
        tags: payload.tags ?? [],
        confidence: payload.confidence ?? null,
        parseConfidence: payload.parseConfidence ?? null,
        fitSummary: payload.fitSummary ?? "",
        jobDescription: payload.jobDescription ?? "",
      };

      await applicationsStore.add(nextInput);
      quickParseSummary = `${nextInput.company} • ${nextInput.title}`;
      quickUrl = "";
      showParseToast(
        "Added To Pipeline",
        `${nextInput.company} landed in ${nextInput.status} in ${formatSeconds(
          performance.now() - startedAt
        )} via ${xAiApiKeyDraft.trim() ? "Grok" : "Heuristic Mode"}${
          nextInput.fitSummary && nextInput.confidence !== null
            ? ` • Fit ${Math.round(nextInput.confidence * 100)}%`
            : ""
        }.`
      );
    } catch (error) {
      quickParseError = error instanceof Error ? error.message : "Unknown Parsing Error.";
    } finally {
      quickParseLoading = false;
    }
  }

  async function handleResyncAll() {
    const applications = $applicationsStore.items;
    const resumableApplications = applications.filter((application) => application.url.trim());

    if (resumableApplications.length === 0) {
      showParseToast("Nothing To Resync", "Saved jobs need a source URL before they can be refreshed.");
      return;
    }

    const confirmationMessage =
      xAiApiKeyDraft.trim() && resumeProfile.rawText.trim()
        ? `Resync ${resumableApplications.length} saved job${resumableApplications.length === 1 ? "" : "s"} with current Grok fit scoring?`
        : `Resync ${resumableApplications.length} saved job${resumableApplications.length === 1 ? "" : "s"} with the current parser settings? Save a Grok key and resume profile if you want fresh fit scores too.`;

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    resyncingApplications = true;

    try {
      const updates: Array<{ id: number; input: JobApplicationInput }> = [];
      let failed = 0;
      let skipped = applications.length - resumableApplications.length;

      for (const application of resumableApplications) {
        try {
          const payload = await parseJobPosting(
            application.url,
            xAiApiKeyDraft,
            xAiModelDraft,
            resumeProfile.rawText
          );

          updates.push({
            id: application.id,
            input: buildResyncedInput(application, payload),
          });
        } catch (error) {
          failed += 1;
        }
      }

      if (updates.length > 0) {
        await applicationsStore.saveMany(updates);
      }

      showParseToast(
        "Applications Resynced",
        `${updates.length} refreshed${failed > 0 ? ` • ${failed} failed` : ""}${skipped > 0 ? ` • ${skipped} skipped` : ""}.`
      );
    } catch (error) {
      showParseToast(
        "Resync Failed",
        error instanceof Error ? error.message : "Unable To Resync Saved Jobs."
      );
    } finally {
      resyncingApplications = false;
    }
  }

  async function loadParserSettings() {
    try {
      const settings = await loadLocalSettings();
      xAiApiKeyDraft = settings.xAiApiKey;
      xAiModelDraft = settings.xAiModel;
      resumeProfile = settings.resumeProfile;
      resumeTextDraft = settings.resumeProfile.rawText;
    } catch (error) {
      settingsStatus =
        error instanceof Error ? error.message : "Unable To Load Local Parser Settings.";
    }
  }

  async function saveParserSettings() {
    try {
      xAiApiKeyDraft = xAiApiKeyDraft.trim();
      xAiModelDraft = xAiModelDraft.trim() || "grok-4-fast-non-reasoning";
      await saveLocalSettings({
        xAiApiKey: xAiApiKeyDraft,
        xAiModel: xAiModelDraft,
        resumeProfile,
      });
      settingsStatus = xAiApiKeyDraft.trim()
        ? "Grok Key Saved On This Device."
        : "Grok Key Cleared.";
    } catch (error) {
      settingsStatus =
        error instanceof Error ? error.message : "Unable To Save Local Parser Settings.";
    }
  }

  async function handleResumeUpload(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      return;
    }

    try {
      resumeTextDraft = (await file.text()).trim();
      resumeStatus = `${file.name} Loaded. Save The Resume Profile To Use It For Fit Scoring.`;
    } catch (error) {
      resumeStatus = error instanceof Error ? error.message : "Unable To Read That Resume File.";
    } finally {
      target.value = "";
    }
  }

  async function saveResumeProfile() {
    try {
      const nextResumeProfile = createResumeProfile(resumeTextDraft);
      await saveLocalSettings({
        xAiApiKey: xAiApiKeyDraft,
        xAiModel: xAiModelDraft,
        resumeProfile: nextResumeProfile,
      });
      resumeProfile = nextResumeProfile;
      resumeTextDraft = nextResumeProfile.rawText;
      resumeStatus = nextResumeProfile.rawText
        ? `Resume Profile Saved With ${nextResumeProfile.skills.length} Tracked Skill${nextResumeProfile.skills.length === 1 ? "" : "s"}.`
        : "Resume Profile Cleared.";
    } catch (error) {
      resumeStatus =
        error instanceof Error ? error.message : "Unable To Save The Resume Profile.";
    }
  }

  async function handleExportBackup() {
    backupBusy = true;
    backupStatus = "";

    try {
      const result = await exportBackupToFile();

      if (result.cancelled) {
        backupStatus = "Backup Export Cancelled.";
        return;
      }

      backupStatus = `Backup Exported To ${result.path}.`;
    } catch (error) {
      backupStatus = error instanceof Error ? error.message : "Unable To Export Backup.";
    } finally {
      backupBusy = false;
    }
  }

  async function handleImportBackup() {
    if (!window.confirm("Importing a backup will replace the current local pipeline on this device. Continue?")) {
      return;
    }

    backupBusy = true;
    backupStatus = "";

    try {
      const result = await importBackupFromFile();

      if (result.cancelled) {
        backupStatus = "Backup Import Cancelled.";
        return;
      }

      quickParseSummary = "";
      quickParseError = "";
      await Promise.all([applicationsStore.load(), loadParserSettings()]);
      backupStatus = `Imported ${result.applications} Application${result.applications === 1 ? "" : "s"} From Backup.`;
    } catch (error) {
      backupStatus = error instanceof Error ? error.message : "Unable To Import Backup.";
    } finally {
      backupBusy = false;
    }
  }

  function clearParseToastTimer() {
    if (parseToastTimer) {
      clearTimeout(parseToastTimer);
      parseToastTimer = null;
    }
  }

  function showParseToast(title: string, body: string) {
    clearParseToastTimer();
    parseToast = { id: Date.now(), title, body };
    parseToastTimer = setTimeout(() => {
      parseToast = null;
      parseToastTimer = null;
    }, 3400);
  }

  function formatSeconds(durationMs: number) {
    return `${(durationMs / 1000).toFixed(1)} S`;
  }

  function toCumulative(values: number[]) {
    let total = 0;
    return values.map((value) => {
      total += value;
      return total;
    });
  }

  function buildTrend(
    values: { current: number; previous: number },
    freshLabel: string
  ): { direction: TrendDirection; label: string } {
    if (values.current === 0 && values.previous === 0) {
      return { direction: "flat", label: "Quiet Vs Last Week" };
    }

    if (values.previous === 0) {
      return {
        direction: values.current > 0 ? "up" : "flat",
        label: `${values.current} ${freshLabel}`,
      };
    }

    const delta = Math.round(((values.current - values.previous) / values.previous) * 100);

    if (delta === 0) {
      return { direction: "flat", label: "Steady Vs Last Week" };
    }

    return {
      direction: delta > 0 ? "up" : "down",
      label: `${delta > 0 ? "+" : ""}${delta}% Vs Last Week`,
    };
  }
</script>

<svelte:head>
  <title>Job Raptor</title>
  <meta
    name="description"
    content="Track job applications with a local-first desktop dashboard, SQLite storage, and AI-assisted URL parsing."
  />
</svelte:head>

<div class="app-shell">
  <div class="dashboard">
    <section class="panel hero-panel scene-hero">
      <div class="hero-grid">
        <div class="panel-grid hero-primary">
          <p class="eyebrow">Job Raptor Desktop</p>
          <h1 class="hero-heading">
            Paste A Job.
            <span>Catch It Fast.</span>
          </h1>
          <p class="body">
            Drop in a careers link and Job Raptor will parse it, save it,
            and move it straight into your pipeline in one click.
          </p>

          <form class="panel-grid parser-spotlight" on:submit|preventDefault={handleQuickParse}>
            <div class="field">
              <div class="meta-row">
                <p class="field-label">Primary Capture</p>
                <span class="meta-pill">
                  {quickParseProvider}
                </span>
              </div>
              <div class="quick-parse-bar quick-parse-bar-prominent">
                <input
                  bind:value={quickUrl}
                  class="mono-input mono-input-prominent"
                  placeholder="Https://Company.Com/Careers/Role"
                />
                <button
                  type="submit"
                  class="ghost-button"
                  disabled={quickParseLoading}
                >
                  {quickParseLoading ? "Adding Role" : "Add From Url"}
                </button>
              </div>
            </div>
            <p class="micro">
              One click parses the posting and saves it directly. Use manual add only when you need full control.
            </p>
          </form>

          <div class="meta-row">
            <span class="meta-pill">{storageModeLabel}</span>
            <span class="meta-pill">Offline First</span>
            <button type="button" class="ghost-button ghost-button-small" on:click={openCreate}>
              Add Manually
            </button>
          </div>

          {#if $applicationsStore.error}
            <p class="micro">{$applicationsStore.error}</p>
          {/if}
        </div>

        <div class="panel-grid hero-secondary">
          <div class="panel-grid" style="gap: 0.35rem;">
            <p class="eyebrow">Capture Loop</p>
            <h2 class="title">Keep New Roles Moving Without Extra Review Steps.</h2>
            <p class="body">
              Every saved role lands in the pipeline immediately, and you can still tweak fields later from edit or refresh older ones from the workspace.
            </p>
          </div>

          {#if quickParseLoading}
            <div class="parser-feedback parser-feedback-live">
              <div class="feedback-inline">
                <span class="pulse-dot" aria-hidden="true"></span>
                <span class="micro">
                  Parsing And Saving With {xAiApiKeyDraft.trim() ? "Grok" : "Heuristic Mode"}.
                </span>
              </div>
            </div>
          {:else if quickParseError}
            <div class="parser-feedback parser-feedback-danger">
              <p class="micro">{quickParseError}</p>
            </div>
          {:else if quickParseSummary}
            <div class="parser-feedback parser-feedback-success">
              <div class="panel-grid" style="gap: 0.25rem;">
                <p class="field-label">Latest Add</p>
                <p class="table-title">{quickParseSummary}</p>
                <p class="micro">
                  Added straight to the pipeline. Edit it anytime from the workspace below.
                </p>
              </div>
            </div>
          {/if}
        </div>
      </div>

      <div class="metric-grid metric-grid-hero">
        <MetricCard
          eyebrow="Pipeline"
          value={String(metrics.totalApplications)}
          trend={totalTrend.label}
          trendDirection={totalTrend.direction}
          sparkline={recentCreatedSeries}
          note="All Tracked Roles Across The Search."
        />
        <MetricCard
          eyebrow="Active"
          value={String(metrics.activePipeline)}
          trend={activeTrend.label}
          trendDirection={activeTrend.direction}
          sparkline={recentActiveSeries}
          note="Roles Still Moving Through The Funnel."
        />
        <MetricCard
          eyebrow="This Week"
          value={String(metrics.appliedThisWeek)}
          trend={appliedTrend.label}
          trendDirection={appliedTrend.direction}
          sparkline={recentAppliedSeries}
          note="Fresh Applications Over Seven Days."
        />
        <MetricCard
          eyebrow="Response"
          value={formatPercent(metrics.responseRate)}
          tone={metrics.responseRate >= 30 ? "positive" : metrics.responseRate > 0 ? "warning" : "danger"}
          trend={responseTrend.label}
          trendDirection={responseTrend.direction}
          sparkline={recentResponseSeries}
          note={`${metrics.staleCount} Stalled Thread${metrics.staleCount === 1 ? "" : "s"} Flagged.`}
        />
      </div>
    </section>

    <div class="dashboard-grid scene-workspace">
      <div class="content-stack">
        <section class="panel workspace-switcher-panel">
          <div class="workspace-switcher-row">
            <div class="panel-grid" style="gap: 0.25rem;">
              <p class="eyebrow">Workspace</p>
              <h2 class="title">Focus On One View At A Time.</h2>
            </div>
            <div class="segmented-control" role="tablist" aria-label="Workspace view">
              <button
                type="button"
                class:segmented-button-active={activeView === "table"}
                class="segmented-button"
                on:click={() => (activeView = "table")}
              >
                Table
              </button>
              <button
                type="button"
                class:segmented-button-active={activeView === "analytics"}
                class="segmented-button"
                on:click={() => (activeView = "analytics")}
              >
                Analytics
              </button>
              <button
                type="button"
                class:segmented-button-active={activeView === "settings"}
                class="segmented-button"
                on:click={() => (activeView = "settings")}
              >
                Settings
              </button>
            </div>
          </div>
        </section>

        {#if activeView === "table"}
          <ApplicationsTable
            applications={$applicationsStore.items}
            busy={$applicationsStore.syncing || resyncingApplications}
            on:edit={handleEdit}
            on:remove={handleRemove}
            on:resyncall={handleResyncAll}
            on:statuschange={handleStatusChange}
          />
        {:else if activeView === "analytics"}
          <AnalyticsPanel metrics={metrics} />
        {:else}
          <section class="panel">
            <div class="panel-grid settings-panel-body">
              <div class="panel-grid" style="gap: 0.25rem;">
                <p class="eyebrow">Settings</p>
                <h2 class="title">Parser, Resume, And Local Backup Controls.</h2>
              </div>

              <div class="field">
                <p class="field-label">Grok Api Key</p>
                <div class="quick-parse-bar">
                  <input
                    bind:value={xAiApiKeyDraft}
                    class="mono-input"
                    type="password"
                    placeholder="Paste Your XAI Api Key"
                    autocomplete="off"
                  />
                  <button type="button" class="ghost-button" on:click={saveParserSettings}>
                    Save Grok
                  </button>
                </div>
              </div>

              <div class="field">
                <p class="field-label">Grok Model</p>
                <input
                  bind:value={xAiModelDraft}
                  class="mono-input"
                  placeholder="grok-4-fast-non-reasoning"
                />
              </div>

              {#if settingsStatus}
                <p class="micro">{settingsStatus}</p>
              {/if}

              <p class="micro">
                Save an xAI key for richer native parsing. Leave it blank to stay in heuristic mode.
              </p>

              <div class="settings-divider"></div>

              <div class="settings-cluster">
                <div class="panel-grid" style="gap: 0.35rem;">
                  <p class="field-label">Resume Profile</p>
                  <p class="micro">
                    Upload or paste your resume text. It stays local and becomes the source of truth for fit scoring.
                  </p>
                </div>

                <div class="meta-row">
                  <span class="meta-pill">{resumeProfile.skills.length} Skills Tracked</span>
                  <span class="meta-pill">
                    {resumeProfile.updatedAt ? `Updated ${new Date(resumeProfile.updatedAt).toLocaleDateString("en-US")}` : "No Resume Saved"}
                  </span>
                </div>

                <div class="field">
                  <p class="field-label">Resume Text</p>
                  <textarea
                    bind:value={resumeTextDraft}
                    rows="8"
                    class="mono-textarea"
                    placeholder="Paste the raw text of your resume here, or upload a plain text file."
                  ></textarea>
                </div>

                <div class="action-row">
                  <label class="ghost-button ghost-button-small file-upload-button">
                    Upload Resume
                    <input
                      type="file"
                      class="visually-hidden-file"
                      accept=".txt,.md,text/plain,text/markdown"
                      on:change={handleResumeUpload}
                    />
                  </label>
                  <button type="button" class="ghost-button" on:click={saveResumeProfile}>
                    Save Resume
                  </button>
                </div>

                {#if resumeStatus}
                  <p class="micro">{resumeStatus}</p>
                {/if}

                {#if resumeProfile.summary}
                  <p class="micro">{resumeProfile.summary}</p>
                {/if}

                {#if resumeProfile.skills.length > 0}
                  <div class="meta-row">
                    {#each resumeProfile.skills.slice(0, 10) as skill}
                      <span class="meta-pill">{skill}</span>
                    {/each}
                  </div>
                {/if}
              </div>

              <div class="settings-divider"></div>

              <div class="settings-cluster">
                <div class="panel-grid" style="gap: 0.35rem;">
                  <p class="field-label">Backup Tools</p>
                  <p class="micro">
                    Export a portable backup from dev, then import it into the installed app.
                  </p>
                </div>
                <div class="action-row">
                  <button
                    type="button"
                    class="ghost-button"
                    disabled={backupBusy}
                    on:click={handleExportBackup}
                  >
                    {backupBusy ? "Working" : "Export Backup"}
                  </button>
                  <button
                    type="button"
                    class="ghost-button"
                    disabled={backupBusy}
                    on:click={handleImportBackup}
                  >
                    Import Backup
                  </button>
                </div>
              </div>

              {#if backupStatus}
                <p class="micro">{backupStatus}</p>
              {/if}
            </div>
          </section>
        {/if}
      </div>
    </div>
  </div>
</div>

<AddJobModal
  bind:open={showComposer}
  application={editingApplication}
  apiKey={xAiApiKeyDraft}
  model={xAiModelDraft}
  resumeText={resumeProfile.rawText}
  seedInput={composerSeed}
  on:save={handleSave}
/>

{#if parseToast}
  <div class="toast-stack" aria-live="polite">
    {#key parseToast.id}
      <aside class="success-toast" in:fly={{ y: 18, duration: 220 }} out:fade={{ duration: 160 }}>
        <div class="success-toast-mark" aria-hidden="true"></div>
        <div class="panel-grid" style="gap: 0.2rem;">
          <p class="field-label">{parseToast.title}</p>
          <p class="table-title">{parseToast.body}</p>
        </div>
      </aside>
    {/key}
  </div>
{/if}
