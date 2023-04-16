<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { BudgetItemModel } from "../models";
  import RateSelector from "./RateSelector.svelte";

  export let item: BudgetItemModel;

  let dispatch = createEventDispatcher();

  function deleteMe() {
    dispatch("delete-item", {
      id: item.id,
    });
  }

  function save() {
    dispatch("save-item", {
      id: item.id,
    });
  }
</script>

<input bind:value={item.name} on:input={save} />
$<input bind:value={item.spending.amount} on:input={save} />
<span>per</span>
<RateSelector bind:value={item.spending.perMonth} on:change={save} />
<span
  >(${(item.spending.amount * item.spending.perMonth).toFixed(2)} monthly)</span
>
<label
  >exclude <input
    type="checkbox"
    bind:checked={item.excludeFromTotal}
    on:change={save}
  /></label
>
<button on:click={deleteMe}>delete</button>
