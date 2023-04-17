<script lang="ts">
  import Income from "./components/Income.svelte";
  import Spending from "./components/Spending.svelte";
  import type { BudgetModel } from "./models";

  let budgetData: BudgetModel = JSON.parse(
    localStorage.getItem("__budget_planner:budget-data") || `{ "expenses": [] }`
  );
  budgetData.id = budgetData.id || crypto.randomUUID();
  budgetData.income = budgetData.income || [];

  $: totalSpending = budgetData.expenses
    .filter((it) => !it.excludeFromTotal)
    .reduce(
      (result, next) => result + next.spending.perMonth * next.spending.amount,
      0
    );

  $: totalIncome = budgetData.income.reduce(
    (result, next) => result + next.amount.perMonth * next.amount.amount,
    0
  );

  $: totalDiff = totalIncome - totalSpending;
  $: isDeficit = totalDiff < 0;

  $: forecastedTotalSpending = budgetData.expenses.reduce(
    (result, next) => result + next.futureMonthlyAmount,
    0
  );
  $: foracastDiff = totalIncome - forecastedTotalSpending;
  $: forcastDeficit = foracastDiff < 0;

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
  function selectTab(tab) {
    currentTab = tab;
    localStorage.setItem("__budget_planner:tab", tab);
  }
</script>

<h1>Budget Explorer</h1>
<main>
  <section>
    <h2>Actual Overview</h2>
    <div>
      Total spending: ${totalSpending.toFixed(2)}
    </div>
    <div>
      Total income: ${totalIncome.toFixed(2)}
    </div>
    <div class:deficit={isDeficit}>
      {isDeficit ? "Deficit" : "Surlpus"} ${Math.abs(
        totalIncome - totalSpending
      ).toFixed(2)}
    </div>
    <h2>Forecasted Overview</h2>
    <div>
      Total spending: ${forecastedTotalSpending.toFixed(2)}
    </div>
    <div>
      Total income: ${totalIncome.toFixed(2)}
    </div>
    <div class:deficit={forcastDeficit}>
      {forcastDeficit ? "Deficit" : "Surlpus"} ${Math.abs(
        totalIncome - forecastedTotalSpending
      ).toFixed(2)}
    </div>
  </section>
  <section>
    <ul>
      <li on:click={() => selectTab("Spending")}>Spending</li>
      <li on:click={() => selectTab("Income")}>Income</li>
      <li on:click={() => selectTab("Advanced")}>Advanced</li>
    </ul>
    {#if currentTab == "Spending"}
      <Spending
        bind:budgetItems={budgetData.expenses}
        on:spending-saved={save}
      />
    {:else if currentTab == "Income"}
      <Income bind:income={budgetData.income} on:income-saved={save} />
    {:else if currentTab == "Advanced"}
      <button on:click={exportJson}>export</button>
      <button on:click={importJson}>import</button>
      <input type="file" bind:files={importData} />
    {/if}
  </section>
</main>

<style lang="less">
  main {
    display: flex;
  }

  div {
    &.deficit {
      color: red;
    }
  }
</style>
