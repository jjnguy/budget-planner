<script lang="ts">
  import BudgetItem from "./components/BudgetItem.svelte";
  import RateSelector from "./components/RateSelector.svelte";
  import type { BudgetItemModel } from "./models";

  let budgetItems: Array<BudgetItemModel> = JSON.parse(
    localStorage.getItem("budget-itmes") || "[]"
  );

  let newItemName: string;
  let newItemSpending: number;
  let newItemSpendingRate: number;

  function exportJson() {
    let contentType = "application/json";
    let a = document.createElement("a");
    let blob = new Blob([JSON.stringify(budgetItems)], { type: contentType });
    a.href = window.URL.createObjectURL(blob);
    a.download = "backup.budget.json";
    a.click();
  }

  let importData: FileList;
  function importJson() {
    let single = importData[0];
    let reader = new FileReader();
    reader.onloadend = () => {
      budgetItems = JSON.parse(reader.result.toString());
      save();
    };
    reader.readAsText(single);
    console.log(importData);
  }

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

  function save() {
    localStorage.setItem("budget-itmes", JSON.stringify(budgetItems));
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

<main>
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
  <button on:click={exportJson}>export</button>
  <button on:click={importJson}>import</button>
  <input type="file" bind:files={importData} />
</main>

<style lang="less">
  main {
    text-align: center;
    padding: 1em;
    margin: 0 auto;
  }
</style>
