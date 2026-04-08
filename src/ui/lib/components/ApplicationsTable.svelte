<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { JobApplication } from "$lib/types";
  import { formatDate, formatRelativeTime } from "$lib/utils";
  import StatusBadge from "$lib/components/StatusBadge.svelte";

  export let applications: JobApplication[] = [];
  export let busy = false;

  const dispatch = createEventDispatcher<{
    edit: JobApplication;
    remove: { id: number };
    statuschange: { id: number; status: string };
  }>();

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
</script>

<section class="panel">
  <div class="panel-grid">
    <div class="meta-row" style="justify-content: space-between;">
      <div class="panel-grid" style="gap: 0.25rem;">
        <p class="eyebrow">Applications</p>
        <h2 class="title">Pipeline Table</h2>
      </div>
      <span class="meta-pill">{applications.length} Visible</span>
    </div>

    <div class="table-wrap">
      <table class="applications-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Source</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Applied</th>
            <th>Touched</th>
            <th>Tags</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {#if applications.length === 0}
            <tr>
              <td colspan="8" class="empty-row">No Applications Match The Current Filter.</td>
            </tr>
          {/if}

          {#each applications as application (application.id)}
            <tr class="applications-row">
              <td>
                <button
                  type="button"
                  class="table-link"
                  on:click={() => dispatch("edit", application)}
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
                    {application.confidence === null ? "Saved Manually" : "AI Parse"}
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
    overflow-x: auto;
  }

  .applications-table {
    width: 100%;
    border-collapse: collapse;
  }

  .applications-table th,
  .applications-table td {
    padding: 1rem 0.75rem;
    vertical-align: top;
    border-top: 1px solid var(--color-border);
  }

  .applications-row {
    transition: background-color 0.2s ease;
  }

  .applications-row:hover {
    background: rgba(240, 240, 250, 0.025);
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
    color: rgba(224, 252, 255, 0.98);
  }

  .table-title {
    display: block;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-transform: none;
  }

  .table-subtitle,
  .table-copy {
    display: block;
    margin-top: 0.3rem;
    font-size: 13px;
    line-height: 1.5;
    letter-spacing: -0.01em;
    text-transform: none;
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
    border-color: rgba(105, 215, 160, 0.3);
    background: rgba(105, 215, 160, 0.1);
    color: #69d7a0;
  }

  .confidence-pill-medium {
    border-color: rgba(255, 207, 112, 0.3);
    background: rgba(255, 207, 112, 0.1);
    color: #ffcf70;
  }

  .confidence-pill-low {
    border-color: rgba(255, 127, 143, 0.3);
    background: rgba(255, 127, 143, 0.1);
    color: #ff7f8f;
  }

  .confidence-pill-manual {
    border-color: rgba(240, 240, 250, 0.16);
    background: rgba(240, 240, 250, 0.04);
    color: var(--color-text-soft);
  }
</style>
