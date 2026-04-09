<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { isTauriRuntime } from "$lib/runtime";
  import { PIPELINE_STAGES, type JobApplication } from "$lib/types";
  import { formatDate, formatRelativeTime } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";

  export let applications: JobApplication[] = [];
  export let busy = false;

  type SortKey = "role" | "source" | "confidence" | "status" | "applied" | "touched" | "tags";
  type SortDirection = "asc" | "desc";

  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  const statusOrder = new Map<string, number>(
    PIPELINE_STAGES.map((status, index) => [status, index])
  );

  const dispatch = createEventDispatcher<{
    edit: JobApplication;
    remove: { id: number };
    resyncall: void;
    statuschange: { id: number; status: string };
  }>();

  let sortKey: SortKey = "touched";
  let sortDirection: SortDirection = "desc";

  $: sortedApplications = [...applications].sort((left, right) =>
    compareApplications(left, right, sortKey, sortDirection)
  );

  function handleStatusChange(id: number, event: Event) {
    const target = event.currentTarget as HTMLSelectElement;
    dispatch("statuschange", { id, status: target.value });
  }

  function getConfidenceLabel(confidence: number | null) {
    if (confidence === null) {
      return "Manual";
    }

    return `${Math.round(confidence * 100)}%`;
  }

  function getConfidenceTone(confidence: number | null) {
    if (confidence === null) {
      return "confidence-pill-manual";
    }

    if (confidence >= 0.8) {
      return "confidence-pill-high";
    }

    if (confidence >= 0.6) {
      return "confidence-pill-medium";
    }

    return "confidence-pill-low";
  }

  function compareText(left: string, right: string) {
    return collator.compare(left, right);
  }

  function compareApplications(
    left: JobApplication,
    right: JobApplication,
    key: SortKey,
    direction: SortDirection
  ) {
    let result = 0;

    switch (key) {
      case "role":
        result =
          compareText(left.title, right.title) || compareText(left.company, right.company);
        break;
      case "source":
        result =
          compareText(left.source, right.source) || compareText(left.title, right.title);
        break;
      case "confidence":
        result =
          (left.confidence ?? -1) - (right.confidence ?? -1) ||
          compareText(left.title, right.title);
        break;
      case "status":
        result =
          (statusOrder.get(left.status) ?? 999) - (statusOrder.get(right.status) ?? 999) ||
          compareText(left.title, right.title);
        break;
      case "applied":
        result = left.appliedDate - right.appliedDate || compareText(left.title, right.title);
        break;
      case "touched":
        result = left.lastUpdated - right.lastUpdated || compareText(left.title, right.title);
        break;
      case "tags":
        result =
          compareText(left.tags.join(" "), right.tags.join(" ")) ||
          compareText(left.title, right.title);
        break;
    }

    if (result === 0) {
      result = left.id - right.id;
    }

    return direction === "asc" ? result : -result;
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      return;
    }

    sortKey = nextKey;
    sortDirection =
      nextKey === "confidence" || nextKey === "applied" || nextKey === "touched"
        ? "desc"
        : "asc";
  }

  function getSortIcon(key: SortKey) {
    if (sortKey !== key) {
      return "↕";
    }

    return sortDirection === "asc" ? "↑" : "↓";
  }

  function getAriaSort(key: SortKey) {
    if (sortKey !== key) {
      return "none";
    }

    return sortDirection === "asc" ? "ascending" : "descending";
  }

  async function openApplicationUrl(application: JobApplication) {
    const url = application.url.trim();

    if (!url) {
      dispatch("edit", application);
      return;
    }

    try {
      new URL(url);
    } catch (error) {
      dispatch("edit", application);
      return;
    }

    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_external_url", { url });
      return;
    }

    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      window.location.href = url;
    }
  }
</script>

<section class="panel">
  <div class="panel-grid">
    <div class="meta-row items-start justify-between gap-4 sm:items-center">
      <div class="panel-grid" style="gap: 0.25rem;">
        <p class="eyebrow">Applications</p>
        <h2 class="title">Pipeline Table</h2>
      </div>
      <div class="action-row w-full sm:w-auto sm:justify-end">
        <button
          type="button"
          class="ghost-button ghost-button-small"
          disabled={busy || applications.length === 0}
          on:click={() => dispatch("resyncall")}
        >
          {busy ? "Refreshing" : "Refresh Pipeline"}
        </button>
        <span class="meta-pill">{applications.length} Visible</span>
      </div>
    </div>

    <div class="table-wrap">
      <table class="applications-table">
        <thead>
          <tr>
            <th aria-sort={getAriaSort("role")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("role")}>
                <span>Role</span>
                <span class:sort-icon-active={sortKey === "role"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("role")}
                </span>
              </button>
            </th>
            <th aria-sort={getAriaSort("source")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("source")}>
                <span>Source</span>
                <span class:sort-icon-active={sortKey === "source"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("source")}
                </span>
              </button>
            </th>
            <th aria-sort={getAriaSort("confidence")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("confidence")}>
                <span>Ai Confidence</span>
                <span class:sort-icon-active={sortKey === "confidence"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("confidence")}
                </span>
              </button>
            </th>
            <th aria-sort={getAriaSort("status")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("status")}>
                <span>Status</span>
                <span class:sort-icon-active={sortKey === "status"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("status")}
                </span>
              </button>
            </th>
            <th aria-sort={getAriaSort("applied")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("applied")}>
                <span>Applied</span>
                <span class:sort-icon-active={sortKey === "applied"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("applied")}
                </span>
              </button>
            </th>
            <th aria-sort={getAriaSort("touched")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("touched")}>
                <span>Touched</span>
                <span class:sort-icon-active={sortKey === "touched"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("touched")}
                </span>
              </button>
            </th>
            <th aria-sort={getAriaSort("tags")}>
              <button type="button" class="sort-button" on:click={() => toggleSort("tags")}>
                <span>Tags</span>
                <span class:sort-icon-active={sortKey === "tags"} class="sort-icon" aria-hidden="true">
                  {getSortIcon("tags")}
                </span>
              </button>
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if applications.length === 0}
            <tr>
              <td colspan="8" class="empty-row">No Applications Match The Current Filter.</td>
            </tr>
          {/if}

          {#each sortedApplications as application (application.id)}
            <tr class="applications-row">
              <td>
                <button
                  type="button"
                  class="table-link"
                  title="Open job posting"
                  on:click={() => openApplicationUrl(application)}
                >
                  <span class="table-title">{application.title}</span>
                  <span class="table-subtitle">
                    {application.company}
                    {#if !application.location.toLowerCase().includes("not listed")}
                      • {application.location}
                    {/if}
                  </span>
                </button>
              </td>
              <td>
                <span class="table-copy">{application.source}</span>
              </td>
              <td>
                <div class="panel-grid" style="gap: 0.35rem;">
                  <span class={`confidence-pill ${getConfidenceTone(application.confidence)}`}>
                    {getConfidenceLabel(application.confidence)}
                  </span>
                  <span class="table-copy">
                    {application.fitSummary
                      ? "Resume Match"
                      : application.parseConfidence !== null
                        ? "Ai Confidence"
                        : "Saved Manually"}
                  </span>
                </div>
              </td>
              <td>
                <div class="panel-grid" style="gap: 0.55rem;">
                  <StatusBadge status={application.status} />
                  <select
                    class="mono-select"
                    value={application.status}
                    disabled={busy}
                    on:change={(event) => handleStatusChange(application.id, event)}
                  >
                    <option>Wishlist</option>
                    <option>Applied</option>
                    <option>Phone Screen</option>
                    <option>Interview Loop</option>
                    <option>Offer</option>
                    <option>Rejected</option>
                    <option>Archived</option>
                  </select>
                </div>
              </td>
              <td>
                <span class="table-copy">{formatDate(application.appliedDate)}</span>
              </td>
              <td>
                <span class="table-copy">{formatRelativeTime(application.lastUpdated)}</span>
              </td>
              <td>
                <span class="table-copy">
                  {application.tags.length > 0 ? application.tags.join(" • ") : "No Tags"}
                </span>
              </td>
              <td>
                <div class="action-row">
                  <button
                    type="button"
                    class="ghost-button"
                    on:click={() => dispatch("edit", application)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="ghost-button"
                    disabled={busy}
                    on:click={() => dispatch("remove", { id: application.id })}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</section>

<style lang="postcss">
  .table-wrap {
    @apply max-w-full overflow-x-auto;
  }

  .applications-table {
    min-width: 72rem;
    width: 100%;
    border-collapse: collapse;
  }

  .applications-table th,
  .applications-table td {
    padding: 1rem 0.5rem;
    vertical-align: top;
    border-top: 1px solid var(--color-line);
  }

  .applications-row {
    transition: opacity 0.2s ease;
  }

  .applications-row:hover {
    opacity: 0.94;
  }

  .applications-table th {
    text-align: left;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1.17px;
    text-transform: uppercase;
    color: var(--color-text-faint);
    border-top: 0;
    padding-top: 0;
  }

  .sort-button {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0;
    border: 0;
    background: transparent;
    text-align: left;
    font: inherit;
    color: inherit;
    transition: color 0.2s ease;
  }

  .sort-button:hover {
    color: var(--color-text);
  }

  .sort-icon {
    color: var(--color-text-faint);
    transition: color 0.2s ease, transform 0.2s ease;
  }

  .sort-icon-active {
    color: var(--color-text);
  }

  .table-link {
    padding: 0;
    background: transparent;
    border: 0;
    text-align: left;
    color: inherit;
    transition: opacity 0.2s ease;
  }

  .table-link:hover {
    opacity: 0.96;
    color: var(--color-text);
  }

  .table-title {
    display: block;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .table-subtitle,
  .table-copy {
    display: block;
    margin-top: 0.3rem;
    font-size: 12px;
    line-height: 1.6;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-soft);
  }

  .empty-row {
    font-size: 12px;
    letter-spacing: 1.17px;
    text-transform: uppercase;
    color: var(--color-text-faint);
  }

  .confidence-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 30px;
    width: fit-content;
    padding: 0 10px;
    border-radius: 999px;
    border: 1px solid var(--color-border);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.17px;
    text-transform: uppercase;
  }

  .confidence-pill-high {
    border-color: var(--color-ghost-border);
    background: var(--color-ghost-bg);
    color: var(--color-text);
  }

  .confidence-pill-medium {
    border-color: rgba(240, 240, 250, 0.26);
    background: rgba(240, 240, 250, 0.08);
    color: rgba(240, 240, 250, 0.92);
  }

  .confidence-pill-low {
    border-color: rgba(240, 240, 250, 0.18);
    background: rgba(240, 240, 250, 0.04);
    color: rgba(240, 240, 250, 0.76);
  }

  .confidence-pill-manual {
    border-color: rgba(240, 240, 250, 0.16);
    background: transparent;
    color: var(--color-text-soft);
  }

  @media (max-width: 640px) {
    .applications-table {
      min-width: 58rem;
    }
  }
</style>
