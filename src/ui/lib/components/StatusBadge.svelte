<script lang="ts">
  import { fade, fly } from "svelte/transition";

  export let status = "";

  const toneByStatus: Record<string, string> = {
    Wishlist: "status-wishlist",
    Applied: "status-applied",
    "Phone Screen": "status-screen",
    "Interview Loop": "status-interview",
    Offer: "status-offer",
    Rejected: "status-rejected",
    Archived: "status-archived",
  };

  $: toneClass = toneByStatus[status] ?? "status-default";
</script>

{#key status}
  <span
    class={`status-pill ${toneClass}`}
    in:fly={{ y: 4, duration: 180 }}
    out:fade={{ duration: 120 }}
  >
    <span class="status-dot" aria-hidden="true"></span>
    {status}
  </span>
{/key}

<style lang="postcss">
  .status-pill {
    gap: 0.45rem;
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      background-color 0.2s ease,
      color 0.2s ease;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: currentColor;
  }

  .status-default {
    color: var(--color-text);
  }

  .status-wishlist {
    color: rgba(240, 240, 250, 0.74);
    border-color: rgba(240, 240, 250, 0.2);
    background: rgba(240, 240, 250, 0.04);
  }

  .status-applied {
    color: var(--color-text);
  }

  .status-screen {
    color: rgba(240, 240, 250, 0.92);
  }

  .status-interview {
    color: rgba(240, 240, 250, 0.92);
  }

  .status-offer {
    color: var(--color-text);
    border-color: var(--color-ghost-border);
    background: rgba(240, 240, 250, 0.12);
  }

  .status-rejected {
    color: rgba(240, 240, 250, 0.74);
    border-color: rgba(240, 240, 250, 0.2);
    background: rgba(240, 240, 250, 0.04);
  }

  .status-archived {
    color: rgba(240, 240, 250, 0.62);
    border-color: rgba(240, 240, 250, 0.16);
    background: transparent;
  }
</style>
