<script lang="ts">
  export let eyebrow = "";
  export let value = "";
  export let note = "";
  export let tone: "neutral" | "positive" | "warning" | "danger" = "neutral";
  export let trend = "";
  export let trendDirection: "up" | "down" | "flat" = "flat";
  export let sparkline: number[] = [];

  function buildSparklinePoints(values: number[]) {
    const safeValues = values.length > 1 ? values : [0, 0, 0, 0];
    const max = Math.max(...safeValues, 1);
    const min = Math.min(...safeValues, 0);
    const range = max - min || 1;

    return safeValues
      .map((point, index) => {
        const x = (index / (safeValues.length - 1 || 1)) * 100;
        const y = 22 - ((point - min) / range) * 20;
        return `${x},${y}`;
      })
      .join(" ");
  }

  $: sparklinePoints = buildSparklinePoints(sparkline);
  $: trendMarker =
    trendDirection === "up" ? "↗" : trendDirection === "down" ? "↘" : "•";
</script>

<article class={`metric-card metric-card-${tone}`}>
  <p class="metric-label">{eyebrow}</p>
  <p class="metric-value">{value}</p>
  {#if trend}
    <div class={`metric-trend metric-trend-${trendDirection}`}>
      <span aria-hidden="true">{trendMarker}</span>
      <span>{trend}</span>
    </div>
  {/if}
  {#if sparkline.length > 0}
    <div class="metric-sparkline" aria-hidden="true">
      <svg viewBox="0 0 100 24" preserveAspectRatio="none">
        <polyline points={sparklinePoints} vector-effect="non-scaling-stroke"></polyline>
      </svg>
    </div>
  {/if}
  <p class="metric-note">{note}</p>
</article>

<style lang="postcss">
  .metric-trend {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1.17px;
    text-transform: uppercase;
  }

  .metric-trend-up {
    color: var(--color-text);
  }

  .metric-trend-down {
    color: var(--color-text-soft);
  }

  .metric-trend-flat {
    color: var(--color-text-soft);
  }

  .metric-sparkline {
    height: 28px;
    margin-top: 0.15rem;
  }

  .metric-sparkline svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .metric-sparkline polyline {
    fill: none;
    stroke: var(--color-text);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.5;
    opacity: 0.9;
  }
</style>
