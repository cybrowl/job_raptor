<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import StatusBadge from "$lib/components/StatusBadge.svelte";
  import { PIPELINE_STAGES, type JobApplication } from "$lib/types";
  import { formatRelativeTime, isActiveStatus } from "$lib/utils";

  export let applications: JobApplication[] = [];
  export let busy = false;

  const dispatch = createEventDispatcher<{
    edit: JobApplication;
    quickadd: { status: string };
    statuschange: { id: number; status: string };
  }>();

  interface DragState {
    application: JobApplication;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    width: number;
  }

  let draggedId: number | null = null;
  let activeStage = "";
  let dragState: DragState | null = null;
  let pointerX = 0;
  let pointerY = 0;

  $: columns = PIPELINE_STAGES.map((stage) => ({
    stage,
    items: applications.filter((application) => application.status === stage),
  }));

  function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element
      ? Boolean(target.closest("button, a, input, select, textarea, label"))
      : false;
  }

  function resetDragState() {
    draggedId = null;
    activeStage = "";
    dragState = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  function startDrag(application: JobApplication, event: PointerEvent) {
    if (busy || event.button !== 0 || isInteractiveTarget(event.target)) {
      return;
    }

    const element = event.currentTarget as HTMLElement;
    const rect = element.getBoundingClientRect();

    draggedId = application.id;
    activeStage = application.status;
    pointerX = event.clientX;
    pointerY = event.clientY;
    dragState = {
      application,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    pointerX = event.clientX;
    pointerY = event.clientY;

    const target = document.elementFromPoint(event.clientX, event.clientY);
    const column = target?.closest<HTMLElement>("[data-kanban-stage]");
    activeStage = column?.dataset.kanbanStage ?? "";
    event.preventDefault();
  }

  function endDrag(event: PointerEvent) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const application = dragState.application;
    const nextStage = activeStage;

    resetDragState();

    if (!nextStage || nextStage === application.status) {
      return;
    }

    dispatch("statuschange", { id: application.id, status: nextStage });
  }

  function cancelDrag() {
    if (!dragState) {
      return;
    }

    resetDragState();
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === "Escape") {
      cancelDrag();
    }
  }

  onDestroy(() => {
    resetDragState();
  });

  function isStale(application: JobApplication) {
    return (
      isActiveStatus(application.status) &&
      Date.now() - application.lastUpdated >= 10 * 86_400_000
    );
  }
</script>

<svelte:window
  on:pointermove={handlePointerMove}
  on:pointerup={endDrag}
  on:pointercancel={cancelDrag}
  on:keydown={handleEscape}
/>

<section class="panel">
  <div class="panel-grid">
    <div class="meta-row" style="justify-content: space-between;">
      <div class="panel-grid" style="gap: 0.25rem;">
        <p class="eyebrow">Pipeline Board</p>
        <h2 class="title">Drag Between Stages</h2>
      </div>
      <span class="meta-pill">Native Drag And Drop</span>
    </div>

    <div class="kanban-grid">
      {#each columns as column}
        <div
          class:kanban-column-active={activeStage === column.stage}
          class="kanban-column"
          data-kanban-stage={column.stage}
          role="list"
          aria-label={`${column.stage} applications`}
        >
          <div class="kanban-column-head">
            <div class="panel-grid" style="gap: 0.25rem;">
              <h3 class="kanban-title">{column.stage}</h3>
              <p class="micro">{column.items.length} Entries</p>
            </div>
            <button
              type="button"
              class="ghost-button ghost-button-small"
              on:click={() => dispatch("quickadd", { status: column.stage })}
            >
              + Quick Add
            </button>
          </div>

          <div class="kanban-stack">
            {#if column.items.length === 0}
              <article class="kanban-empty-card">
                <p class="micro">No Roles In This Stage Yet.</p>
                <p class="table-copy">Drag A Card Here Or Start A Fresh Draft.</p>
              </article>
            {/if}

            {#each column.items as application (application.id)}
              <article
                class:kanban-item-dragging={draggedId === application.id}
                class="kanban-item"
                on:pointerdown={(event) => startDrag(application, event)}
              >
                <div class="kanban-item-header">
                  <span class="kanban-grip" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                  <StatusBadge status={application.status} />
                </div>
                <div class="panel-grid" style="gap: 0.35rem;">
                  <p class="table-title">{application.title}</p>
                  <p class="table-copy">{application.company}</p>
                  <p class="table-copy">{application.location}</p>
                  <p class="table-copy">
                    {application.tags.length > 0
                      ? application.tags.slice(0, 3).join(" • ")
                      : "No Tags"}
                  </p>
                  <p class="table-copy">
                    {formatRelativeTime(application.lastUpdated)}
                    {#if isStale(application)}
                      • Stalled
                    {/if}
                  </p>
                </div>

                <div class="action-row">
                  <button
                    type="button"
                    class="ghost-button"
                    on:click={() => dispatch("edit", application)}
                  >
                    Edit
                  </button>
                </div>
              </article>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
</section>

{#if dragState}
  <div class="kanban-drag-layer" aria-hidden="true">
    <article
      class="kanban-item kanban-item-proxy"
      style={`width: ${dragState.width}px; transform: translate(${pointerX - dragState.offsetX}px, ${pointerY - dragState.offsetY}px);`}
    >
      <div class="panel-grid" style="gap: 0.35rem;">
        <p class="table-title">{dragState.application.title}</p>
        <p class="table-copy">{dragState.application.company}</p>
        <p class="table-copy">{dragState.application.location}</p>
        <p class="table-copy">
          {dragState.application.tags.length > 0
            ? dragState.application.tags.slice(0, 3).join(" • ")
            : "No Tags"}
        </p>
      </div>
    </article>
  </div>
{/if}

<style lang="postcss">
  .kanban-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .kanban-column {
    border: 1px solid var(--color-border);
    border-radius: 22px;
    padding: 1rem;
    background: rgba(240, 240, 250, 0.03);
    display: grid;
    gap: 1rem;
    align-content: start;
  }

  .kanban-title {
    margin: 0;
    font-size: 16px;
    line-height: 1.05;
    font-weight: 700;
    letter-spacing: 0.96px;
    text-transform: uppercase;
  }

  .kanban-stack {
    display: grid;
    gap: 0.85rem;
  }

  .kanban-column-head {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 0.75rem;
  }

  .kanban-column-active {
    border-color: var(--color-accent-border);
    background: linear-gradient(180deg, rgba(0, 240, 255, 0.08), rgba(240, 240, 250, 0.04));
  }

  .kanban-item {
    border: 1px solid var(--color-border);
    border-radius: 18px;
    padding: 0.9rem;
    background: rgba(240, 240, 250, 0.02);
    display: grid;
    gap: 0.85rem;
    cursor: grab;
    touch-action: none;
    user-select: none;
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      background-color 0.2s ease;
  }

  .kanban-item:hover {
    transform: translateY(-1px);
    border-color: rgba(240, 240, 250, 0.22);
  }

  .kanban-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .kanban-grip {
    display: inline-grid;
    grid-auto-flow: column;
    gap: 0.25rem;
    align-items: center;
  }

  .kanban-grip span {
    width: 4px;
    height: 18px;
    border-radius: 999px;
    background: rgba(240, 240, 250, 0.22);
  }

  .kanban-item-dragging {
    opacity: 0.25;
  }

  .kanban-item-proxy {
    position: fixed;
    top: 0;
    left: 0;
    margin: 0;
    z-index: 90;
    pointer-events: none;
    border-color: var(--color-border-strong);
    background: rgba(0, 0, 0, 0.96);
  }

  .kanban-drag-layer {
    position: fixed;
    inset: 0;
    z-index: 89;
    pointer-events: none;
  }

  .kanban-empty-card {
    border: 1px dashed rgba(240, 240, 250, 0.2);
    border-radius: 18px;
    padding: 1rem;
    background: rgba(240, 240, 250, 0.015);
    display: grid;
    gap: 0.35rem;
  }

  .table-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    text-transform: none;
  }

  .table-copy {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    letter-spacing: -0.01em;
    text-transform: none;
    color: var(--color-text-soft);
  }

  @media (max-width: 1200px) {
    .kanban-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 720px) {
    .kanban-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
