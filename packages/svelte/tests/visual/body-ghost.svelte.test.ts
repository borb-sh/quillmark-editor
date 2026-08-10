// @vitest-environment jsdom
// The `bodyPlaceholder` hook as the mounted editor asks it: once per card that
// renders a body, carrying that card's identity, and with nothing kept between
// calls. A consumer wanting two empty cards of one kind to read alike writes a
// function of `kind`; one wanting them to differ writes a function of `cardId`.
// Neither is the editor's to decide.
//
// The ghosts observed are the INDORSEMENTS'. The reference quill seeds main's body
// from its `body.example`, and a body with content carries no placeholder
// decoration; main is asked all the same, which is what `seen` is read for.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Document, Quill } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import type { VisualEditorProps } from '$lib/visual/props';
import type { BodyPlaceholderContext } from '$lib/visual/structure';
import { DEFAULT_VISUAL_STRINGS } from '$lib/visual/strings';
import { quill } from '../helpers/fixtures.js';

const BUILT_IN = DEFAULT_VISUAL_STRINGS.bodyGhost;

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

/** Mount over a document carrying one added indorsement beyond the seed, so the kind
 *  appears more than once and per-card wording has something to distinguish. */
function mountEditor(props: Partial<VisualEditorProps> = {}) {
	const q: Quill = quill();
	const doc: Document = q.seedDocument();
	const card = q.seedCard('indorsement', doc.seedOverlay('indorsement'));
	if (card) doc.insertCard(card, doc.cardCount);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(VisualEditor, { target, props: { doc, quill: q, ...props } });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
		doc.free();
	};
	return target;
}

/** Every empty body's rendered ghost, in card order. The decoration stamps
 *  `data-placeholder` on the sole empty paragraph, which is what the CSS prints. */
function ghosts(target: HTMLElement): (string | null)[] {
	return [...target.querySelectorAll<HTMLElement>('.qm-body-leaf [data-placeholder]')].map((el) =>
		el.getAttribute('data-placeholder')
	);
}

describe('the hook is asked per card', () => {
	it('carries each card, so one kind can ghost two ways', () => {
		const seen: BodyPlaceholderContext[] = [];
		const target = mountEditor({
			strings: {
				bodyPlaceholder: (ctx) => {
					seen.push(ctx);
					// Keyed to the card: the answer depends on `cardId` alone, so no two
					// cards collide.
					return `Write ${ctx.cardId}…`;
				}
			}
		});

		// Two cards of ONE kind, wearing different words.
		const drawn = ghosts(target);
		expect(drawn.length).toBeGreaterThan(1);
		expect(new Set(drawn).size).toBe(drawn.length);
		expect(drawn.every((g) => /^Write .+…$/.test(g ?? ''))).toBe(true);

		// The main card is asked too, naming itself; every other ask carries a distinct
		// session key.
		expect(seen.some((s) => s.cardId === 'main' && s.kind === 'main' && s.isMain)).toBe(true);
		const cards = seen.filter((s) => !s.isMain);
		expect(cards.every((s) => s.kind === 'indorsement')).toBe(true);
		expect(new Set(cards.map((s) => s.cardId)).size).toBeGreaterThan(1);
	});

	it('reads as one invitation per kind when the hook is a function of kind', () => {
		// Same kind, same words, because the function says so.
		const target = mountEditor({
			strings: { bodyPlaceholder: (ctx) => (ctx.isMain ? undefined : `Endorse the ${ctx.kind}…`) }
		});

		const drawn = ghosts(target);
		expect(drawn.length).toBeGreaterThan(1);
		expect(new Set(drawn)).toEqual(new Set(['Endorse the indorsement…']));
	});

	it('takes the built-in where the hook declines', () => {
		// `undefined` is the documented defer; the rung below it is the built-in.
		const target = mountEditor({ strings: { bodyPlaceholder: () => undefined } });

		const drawn = ghosts(target);
		expect(drawn.length).toBeGreaterThan(1);
		expect(drawn).toEqual(drawn.map(() => BUILT_IN));
	});

	it('ghosts the built-in when no hook is set', () => {
		// The reference quill declares no body `default:` on any kind, so with no
		// wording every rung falls through to the package's English.
		const target = mountEditor();

		const drawn = ghosts(target);
		expect(drawn.length).toBeGreaterThan(1);
		expect(drawn).toEqual(drawn.map(() => BUILT_IN));
	});
});
