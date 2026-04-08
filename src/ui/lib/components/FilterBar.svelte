<script lang="ts">
  export let value = "";
</script>

<div class="panel-grid">
  <input
    bind:value
    class="mono-input"
    placeholder="TRY REMOTE STATUS:APPLIED SOURCE:LEVER TAG:ENGINEERING"
  />
  <p class="micro">
    SEARCH COMPANY, ROLE, NOTES, SOURCE, OR TAGS. USE TOKENS LIKE
    STATUS:OFFER, SOURCE:LINKEDIN, COMPANY:NOTION, OR TAG:REMOTE.
  </p>
</div>
