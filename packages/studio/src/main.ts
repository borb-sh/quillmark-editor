// The client's one entry: the endorsed look, what studio adds to it, and the app.
//
// `@quillmark/svelte/preset` is the scale and the recipes studio's chrome is drawn
// with — the same import a third-party consumer makes, which is what makes "studio
// looks like the endorsed version" a fact rather than a claim. `studio.css` is the two
// heights it adds on top. Both are global imports, so the chrome reaches every
// component's markup rather than being scoped out of it (STUDIO §"Preventing drift").
import { mount } from 'svelte';
import '@quillmark/svelte/preset';
import './studio.css';
import Studio from './Studio.svelte';

const target = document.getElementById('studio');
if (!target) throw new Error('studio: #studio mount point missing from index.html');

mount(Studio, { target });
