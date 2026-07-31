// How the words reach the components that say them. A Svelte context, because the
// alternative is threading one prop through Card → CardControls / ArrayField /
// FieldHint / FormatPopover / TipsCard, which is five components carrying a prop
// they only pass on, and a sixth forgetting to.
//
// A GETTER is what is provided, not the object: the resolved set is `$derived` in
// the VisualEditor, so a consumer swapping `strings` after mount reaches every
// component without re-providing anything. A component mounted outside a
// VisualEditor falls back to the package's own words rather than throwing: nothing
// here gates rendering.
import { getContext, setContext } from 'svelte';
import { DEFAULT_STRINGS, type EditorStrings } from './strings.js';

const KEY = Symbol('qm.strings');

/** Provide the resolved strings to this subtree (the VisualEditor calls it). */
export function provideStrings(get: () => EditorStrings): void {
	setContext(KEY, get);
}

/** Read them: `const s = strings()` at init, `s().cardDelete` where the word goes. */
export function strings(): () => EditorStrings {
	return getContext<(() => EditorStrings) | undefined>(KEY) ?? (() => DEFAULT_STRINGS);
}
