<script lang="ts">
  import MetricCard from "$lib/components/MetricCard.svelte";
  import type { DashboardMetrics } from "$lib/types";
  import { formatPercent } from "$lib/utils";

  export let metrics: DashboardMetrics;
</script>

<section class="panel">
  <div class="panel-grid">
    <div class="meta-row" style="justify-content: space-between;">
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
        note="Applications Submitted Over Seven Days."
      />
      <MetricCard
        eyebrow="Response"
        value={formatPercent(metrics.responseRate)}
        tone={metrics.responseRate >= 30 ? "positive" : metrics.responseRate > 0 ? "warning" : "danger"}
        note={`${metrics.staleCount} Stalled Role${metrics.staleCount === 1 ? "" : "s"} Flagged.`}
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
  .analytics-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .analytics-list {
    border: 1px solid var(--color-border);
    border-radius: 22px;
    padding: 1rem;
    background: rgba(240, 240, 250, 0.03);
    display: grid;
    gap: 0.7rem;
  }

  .analytics-line {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    font-size: 12px;
    line-height: 1.45;
    letter-spacing: 1.17px;
    text-transform: uppercase;
    color: var(--color-text-soft);
  }

  @media (max-width: 760px) {
    .analytics-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
