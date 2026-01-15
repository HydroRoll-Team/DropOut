<script lang="ts">
  let count: number = $state(0)
</script>

<button onclick={() => count += 1}>
  count is {count}
</button>
