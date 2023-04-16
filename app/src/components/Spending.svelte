<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { ExpenseItemModel } from "../models";
  import RateSelector from "./RateSelector.svelte";
  import BudgetItem from "./BudgetItem.svelte";

  export let budgetItems: Array<ExpenseItemModel>;

  let dispatcher = createEventDispatcher();

  function save() {
    dispatcher("spending-saved");
  }

  let newItemName: string;
  let newItemSpending: number;
  let newItemSpendingRate: number;

  function addItem() {
    budgetItems = [
      ...budgetItems,
      {
        id: crypto.randomUUID(),
        name: newItemName,
        excludeFromTotal: false,
        spending: {
          perMonth: newItemSpendingRate,
          amount: newItemSpending,
        },
      },
    ];

    save();
  }

  function deleteItem(id) {
    budgetItems = budgetItems.filter((it) => it.id != id);

    save();
  }

  function onPaste(e: ClipboardEvent) {
    let pastedData = e.clipboardData.getData("text");
    if (pastedData.includes("\t") && pastedData.includes("\n")) {
      let newItems = pastedData.split("\n").map((l) => {
        let line = l.split("\t");
        let name = line[0];
        let amount = parseFloat(line[1]);
        let perMonth = parseFloat(line[2]);
        return {
          name,
          id: crypto.randomUUID(),
          excludeFromTotal: false,
          spending: {
            perMonth,
            amount,
          },
        };
      });
      budgetItems = [...budgetItems, ...newItems];
      save();
    }
  }
</script>

<form on:submit|preventDefault={addItem}>
  <input bind:value={newItemName} on:paste={onPaste} />
  <input bind:value={newItemSpending} type="number" step="any" />
  <span>per</span>
  <RateSelector bind:value={newItemSpendingRate} />
  <button type="submit">add</button>
</form>
<ol>
  {#each budgetItems as item}
    <li>
      <BudgetItem
        on:delete-item={() => deleteItem(item.id)}
        on:save-item={save}
        bind:item
      />
    </li>
  {/each}
  <li>
    <span>Total:</span><span
      >{budgetItems
        .filter((it) => !it.excludeFromTotal)
        .reduce(
          (result, next) =>
            result + next.spending.perMonth * next.spending.amount,
          0
        )}</span
    >
  </li>
</ol>
<form on:submit|preventDefault={addItem}>
  <input bind:value={newItemName} on:paste={onPaste} />
  <input bind:value={newItemSpending} type="number" step="any" />
  <span>per</span>
  <RateSelector bind:value={newItemSpendingRate} />
  <button type="submit">add</button>
</form>
