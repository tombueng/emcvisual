<script lang="ts">
  import { formatEng, parseEng } from '../physics/units';

  interface Props {
    value: number;
    unit: string;
    min?: number;
    max?: number;
    id?: string;
    onchange: (v: number) => void;
  }
  let { value, unit, min = -Infinity, max = Infinity, id, onchange }: Props = $props();

  let text = $state('');
  let editing = $state(false);
  let invalid = $state(false);

  $effect(() => {
    if (!editing) text = formatEng(value, unit);
  });

  function commit() {
    editing = false;
    const v = parseEng(text);
    if (!Number.isFinite(v) || v < min || v > max) {
      invalid = true;
      text = formatEng(value, unit);
      setTimeout(() => (invalid = false), 1200);
      return;
    }
    invalid = false;
    if (v !== value) onchange(v);
    text = formatEng(v, unit);
  }
</script>

<input
  {id}
  class="value"
  class:invalid
  type="text"
  bind:value={text}
  onfocus={() => (editing = true)}
  onblur={commit}
  onkeydown={(e) => {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
    if (e.key === 'Escape') {
      editing = false;
      text = formatEng(value, unit);
      (e.currentTarget as HTMLInputElement).blur();
    }
  }}
/>
