<script lang="ts">
  import Income from "./components/Income.svelte";
  import Spending from "./components/Spending.svelte";
  import type { BudgetModel } from "./models";

  let budgetData: BudgetModel = JSON.parse(
    localStorage.getItem("__budget_planner:budget-data") || `{ "expenses": [] }`
  );
  budgetData.id = budgetData.id || crypto.randomUUID();
  budgetData.income = budgetData.income || [];

  function save() {
    localStorage.setItem(
      "__budget_planner:budget-data",
      JSON.stringify(budgetData)
    );
  }

  function exportJson() {
    let contentType = "application/json";
    let a = document.createElement("a");
    let blob = new Blob([JSON.stringify(budgetData)], { type: contentType });
    a.href = window.URL.createObjectURL(blob);
    a.download = "backup.budget.json";
    a.click();
  }

  let importData: FileList;
  function importJson() {
    let single = importData[0];
    let reader = new FileReader();
    reader.onloadend = () => {
      budgetData = JSON.parse(reader.result.toString());
      save();
    };
    reader.readAsText(single);
    console.log(importData);
  }

  let currentTab = localStorage.getItem("__budget_planner:tab") || "Spending";
</script>

<main>
  <ul>
    <li on:click={() => (currentTab = "Spending")}>Spending</li>
    <li on:click={() => (currentTab = "Income")}>Income</li>
  </ul>
  {#if currentTab == "Spending"}
    <Spending bind:budgetItems={budgetData.expenses} on:spending-saved={save} />
  {:else if currentTab == "Income"}
    <Income bind:income={budgetData.income} />
  {/if}
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
