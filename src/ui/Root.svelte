<script lang="ts">
  import { i18n } from '../i18n';
  import App from './App.svelte';
</script>

<!-- Switching the language remounts the UI so every formatted number follows it; board, sources
     and results live in the engine and survive the remount. -->
{#key i18n.lang}
  <App />
{/key}
