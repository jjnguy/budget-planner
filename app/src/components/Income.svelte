<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { IncomeItemModel } from "../models";
  import RateSelector from "./RateSelector.svelte";

  export let income: Array<IncomeItemModel>;

  let dispatcher = createEventDispatcher();

  function save() {
    dispatcher("income-saved");
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

<span>Total monthly income</span><span
  >{income.reduce(
    (result, next) => result + next.amount.perMonth * next.amount.amount,
    0
  )}</span
>

<form on:submit|preventDefault={addItem}>
  <input bind:value={newIncomeName} />
  <input bind:value={newIncomeAmount} type="number" step="any" />
  <span>per</span>
  <RateSelector bind:value={newIncomegRate} />
  <button type="submit">add</button>
</form>
