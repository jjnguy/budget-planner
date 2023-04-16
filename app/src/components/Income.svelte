<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { IncomeItemModel } from "../models";
  import RateSelector from "./RateSelector.svelte";

  export let income: Array<IncomeItemModel>;

  let dispatcher = createEventDispatcher();

  function save() {
    dispatcher("spending-saved");
  }

  let newIncomeName: string;
  let newIncomeAmount: number;
  let newIncomegRate: number;

  function addItem() {
    income = [
      ...income,
      {
        id: crypto.randomUUID(),
        name: newIncomeName,
        amount: {
          perMonth: newIncomegRate,
          amount: newIncomeAmount,
        },
      },
    ];

    save();
  }

  function deleteItem(id) {
    income = income.filter((it) => it.id != id);

    save();
  }
</script>

{JSON.stringify(income)}

<form on:submit|preventDefault={addItem}>
  <input bind:value={newIncomeName} />
  <input bind:value={newIncomeAmount} type="number" step="any" />
  <span>per</span>
  <RateSelector bind:value={newIncomegRate} />
  <button type="submit">add</button>
</form>
