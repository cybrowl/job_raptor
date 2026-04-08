<script lang="ts">
  export let value = "";
</script>

<div class="panel-grid">
  <input
    bind:value
    class="mono-input"
    placeholder="Try Remote Status:Applied Source:Lever Tag:Engineering"
  />
  <p class="micro">
    Search company, role, notes, source, or tags. Use scoped tokens like
    status:offer, source:linkedin, company:notion, or tag:remote.
  </p>
</div>
