<script lang="ts">
  import MetricCard from "$lib/components/MetricCard.svelte";
  import type { DashboardMetrics } from "$lib/types";
  import { formatPercent } from "$lib/utils";

  export let metrics: DashboardMetrics;
</script>

<section class="panel">
  <div class="panel-grid">
    <div class="meta-row items-start justify-between gap-4 sm:items-center">
      <div class="panel-grid" style="gap: 0.25rem;">
        <p class="eyebrow">Analytics</p>
        <h2 class="title">Snapshot And Plain-English Insight</h2>
      </div>
      <span class="meta-pill">{metrics.insight}</span>
    </div>

    <div class="metric-grid">
      <MetricCard
        eyebrow="Total"
        value={String(metrics.totalApplications)}
        note="Tracked Applications Across Every Stage."
      />
      <MetricCard
        eyebrow="Active"
        value={String(metrics.activePipeline)}
        note="Roles Still Alive In The Current Pipeline."
      />
      <MetricCard
        eyebrow="This Week"
        value={String(metrics.appliedThisWeek)}
        note="New Roles Captured Over The Last 7 Days."
      />
      <MetricCard
        eyebrow="Response"
        value={formatPercent(metrics.responseRate)}
        tone={metrics.responseRate >= 30 ? "positive" : metrics.responseRate > 0 ? "warning" : "danger"}
        note={`${metrics.staleCount} Stalled Role${metrics.staleCount === 1 ? "" : "s"} Flagged.`}
      />
    </div>

    <div class="analytics-daily-head">
      <p class="field-label">Daily Snapshot</p>
      <p class="micro">A tighter read on what moved today and your current capture pace.</p>
    </div>

    <div class="metric-grid analytics-daily-grid">
      <MetricCard
        eyebrow="Today"
        value={String(metrics.capturedToday)}
        note="New Roles Captured Today."
      />
      <MetricCard
        eyebrow="Touched"
        value={String(metrics.touchedToday)}
        note="Roles Updated Or Advanced Today."
      />
      <MetricCard
        eyebrow="Replies"
        value={String(metrics.repliesToday)}
        note="Conversations That Moved Today."
      />
      <MetricCard
        eyebrow="Daily Pace"
        value={`${metrics.dailyCaptureRate.toFixed(1)}/Day`}
        note="Average New Roles Captured Per Day This Week."
      />
    </div>

    <div class="analytics-grid">
      <div class="analytics-list">
        <p class="field-label">Stage Mix</p>
        {#if metrics.stageBreakdown.length === 0}
          <p class="micro">No Stage Data Available Yet.</p>
        {/if}
        {#each metrics.stageBreakdown as bucket}
          <div class="analytics-line">
            <span>{bucket.label}</span>
            <span>{bucket.total}</span>
          </div>
        {/each}
      </div>

      <div class="analytics-list">
        <p class="field-label">Source Mix</p>
        {#if metrics.sourceBreakdown.length === 0}
          <p class="micro">No Source Data Available Yet.</p>
        {/if}
        {#each metrics.sourceBreakdown as bucket}
          <div class="analytics-line">
            <span>{bucket.label}</span>
            <span>{bucket.total}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
</section>

<style lang="postcss">
  .analytics-daily-head {
    display: grid;
    gap: 0.25rem;
  }

  .analytics-daily-grid {
    margin-top: -0.25rem;
  }

  .analytics-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: 1fr;
  }

  .analytics-list {
    border-top: 1px solid var(--color-line);
    padding: 1rem 0 0;
    background: transparent;
    display: grid;
    gap: 0.7rem;
  }

  .analytics-line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    font-size: 12px;
    line-height: 1.6;
    letter-spacing: 1.17px;
    text-transform: uppercase;
    color: var(--color-text-soft);
  }

  @media (min-width: 1280px) {
    .analytics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
