<script lang="ts">
  /** Text input with suggestions from a list (nets or pads). */
  interface Props {
    value: string;
    options: string[];
    placeholder?: string;
    id?: string;
    onchange: (v: string) => void;
  }
  let { value, options, placeholder = '', id, onchange }: Props = $props();
  const listId = `dl-${Math.random().toString(36).slice(2, 9)}`;
  let text = $state('');
  $effect(() => {
    text = value;
  });
  const known = $derived(new Set(options));
  const unique = $derived([...known]);
</script>

<input
  {id}
  type="text"
  list={listId}
  {placeholder}
  class:invalid={text !== '' && !known.has(text)}
  bind:value={text}
  onchange={() => onchange(text.trim())}
/>
<datalist id={listId}>
  {#each unique as o (o)}
    <option value={o}></option>
  {/each}
</datalist>
