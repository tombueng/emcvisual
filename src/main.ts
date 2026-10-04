import { mount } from 'svelte';
import Root from './ui/Root.svelte';
import { i18n } from './i18n';
import './ui/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('missing #app');
document.documentElement.lang = i18n.lang;
const app = mount(Root, { target });
// the static intro in index.html is for crawlers and visitors without JavaScript
document.getElementById('static-intro')?.remove();
export default app;
