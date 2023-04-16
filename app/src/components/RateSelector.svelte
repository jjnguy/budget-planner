<script lang="ts">
  import { rates } from "../monthlyRates";

  export let value;
</script>

<select bind:value on:change>
  {#each rates as rate}
    <option value={rate.perMonth}>{rate.name}</option>
  {/each}
</select>
