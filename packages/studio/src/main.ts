// The client's one entry: the two host stylesheets and the app.
//
// `studio.css` derives the `--st-*` scale, `chrome.css` is the recipes that read it.
// Both are global imports, so the shared chrome reaches every component's markup
// rather than being scoped out of it (STUDIO §"Preventing drift").
import { mount } from 'svelte';
import './studio.css';
import './chrome.css';
import Studio from './Studio.svelte';

const target = document.getElementById('studio');
if (!target) throw new Error('studio: #studio mount point missing from index.html');

mount(Studio, { target });
