<script lang="ts">
  import { createEventDispatcher } from "svelte";

  export let item;

  let dispatch = createEventDispatcher();

  function deleteMe() {
    dispatch("delete-item", {
      id: item.id,
    });
  }
</script>

<span>{item.name}</span>
<span>{item.monthlyAmount}</span>
<button on:click={deleteMe}>delete</button>
