<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ExpenseItemModel, ExpensesMode } from "../models";
  import RateSelector from "./RateSelector.svelte";

  export let item: ExpenseItemModel;
  export let mode: ExpensesMode;

  item.futureMonthlyAmount =
    item.futureMonthlyAmount ?? item.spending.amount * item.spending.perMonth;

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
{#if mode == "Actual"}
  $<input bind:value={item.spending.amount} on:input={save} />
  <span>per</span>
  <RateSelector bind:value={item.spending.perMonth} on:change={save} />
  <span
    >(${(item.spending.amount * item.spending.perMonth).toFixed(2)} monthly)</span
  >
{/if}

{#if mode == "Planning"}
  <input
    type="range"
    bind:value={item.futureMonthlyAmount}
    min="0"
    max={item.spending.amount * item.spending.perMonth * 2}
    step="0.01"
  />
  <span>(${item.futureMonthlyAmount.toFixed(2)} monthly)</span>
{/if}
<label
  >exclude <input
    type="checkbox"
    bind:checked={item.excludeFromTotal}
    on:change={save}
  /></label
>
<button on:click={deleteMe}>delete</button>
