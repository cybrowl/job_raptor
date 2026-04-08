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
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
  }

  .status-default {
    color: var(--color-text-soft);
    border-color: rgba(240, 240, 250, 0.16);
  }

  .status-wishlist {
    color: #b7bdd8;
    border-color: rgba(183, 189, 216, 0.22);
    background: rgba(183, 189, 216, 0.08);
  }

  .status-applied {
    color: #7fb2ff;
    border-color: rgba(127, 178, 255, 0.28);
    background: rgba(127, 178, 255, 0.09);
  }

  .status-screen {
    color: #ffcf70;
    border-color: rgba(255, 207, 112, 0.28);
    background: rgba(255, 207, 112, 0.08);
  }

  .status-interview {
    color: #ff9a6c;
    border-color: rgba(255, 154, 108, 0.28);
    background: rgba(255, 154, 108, 0.08);
  }

  .status-offer {
    color: #69d7a0;
    border-color: rgba(105, 215, 160, 0.3);
    background: rgba(105, 215, 160, 0.1);
  }

  .status-rejected {
    color: #ff7f8f;
    border-color: rgba(255, 127, 143, 0.28);
    background: rgba(255, 127, 143, 0.08);
  }

  .status-archived {
    color: #8b90a6;
    border-color: rgba(139, 144, 166, 0.22);
    background: rgba(139, 144, 166, 0.08);
  }
</style>
