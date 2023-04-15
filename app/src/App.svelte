<script lang="ts">
  import BudgetItem from "./components/BudgetItem.svelte";

  let budgetItems: Array<any> = JSON.parse(
    localStorage.getItem("budget-itmes") || "[]"
  );

  let newItemName;
  let newItemAmmount;

  function addItem() {
    budgetItems = [
      ...budgetItems,
      {
        id: crypto.randomUUID(),
        monthlyAmount: newItemAmmount,
        name: newItemName,
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
</script>

<main>
  <ol>
    {#each budgetItems as item}
      <li>
        <BudgetItem on:delete-item={() => deleteItem(item.id)} {item} />
      </li>
    {/each}
    <li>
      <span>Total:</span><span
        >{budgetItems.reduce(
          (result, next) => result + next.monthlyAmount,
          0
        )}</span
      >
    </li>
  </ol>
  <form on:submit|preventDefault={addItem}>
    <input bind:value={newItemName} />
    <input bind:value={newItemAmmount} type="number" />
    <button type="submit">add</button>
  </form>
</main>

<style>
  main {
    text-align: center;
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }

  h1 {
    color: #ff3e00;
    text-transform: uppercase;
    font-size: 4em;
    font-weight: 100;
  }

  @media (min-width: 640px) {
    main {
      max-width: none;
    }
  }
</style>
