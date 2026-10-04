import { mount } from 'svelte';
import Root from './ui/Root.svelte';
import { i18n } from './i18n';
import './ui/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('missing #app');
document.documentElement.lang = i18n.lang;
export default mount(Root, { target });
