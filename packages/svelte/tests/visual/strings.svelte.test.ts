// @vitest-environment jsdom
// The two wording seams, exercised the way a localizing product uses them: one
// `strings` key overridden and the rest left English, and one diagnostic re-worded
// through `formatDiagnostic` with the fallback arm still standing behind it.
//
// The key checked in the DOM is an ACCESSIBLE NAME, not decoration, which is the
// reason the seam exists: an untranslated add trigger does not read as
// inconsistent to a screen reader, it reads as the wrong language.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Diagnostic } from '$lib/core';
import { DEFAULT_VISUAL_STRINGS, mergeStrings, diagnosticText } from '$lib/visual/strings';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import type { VisualEditorProps } from '$lib/visual/props';
import { quill } from '../helpers/fixtures.js';

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function mountEditor(props: Partial<VisualEditorProps>) {
	const q = quill();
	const doc = q.seedDocument();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const bag: VisualEditorProps = $state({ doc, quill: q, ...props });
	const app = mount(VisualEditor, { target, props: bag });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
		doc.free();
	};
	return { target, bag };
}

describe('mergeStrings', () => {
	it('fills a partial override to the whole key set', () => {
		const merged = mergeStrings({ cardDelete: 'Supprimer la carte' });
		expect(merged.cardDelete).toBe('Supprimer la carte');
		// Every other key is still the package's, including the parametric ones.
		expect(merged.cardMoveUp).toBe(DEFAULT_VISUAL_STRINGS.cardMoveUp);
		expect(merged.addCardOfKind('Indorsement')).toBe('Add Indorsement');
	});

	it('takes the package set whole when nothing is passed', () => {
		expect(mergeStrings(undefined)).toBe(DEFAULT_VISUAL_STRINGS);
	});
});

describe('strings on the mounted surface', () => {
	it('renders an overridden accessible name and leaves the rest English', () => {
		const { target } = mountEditor({
			strings: { addCardOfKind: (kind: string) => `Ajouter : ${kind}` }
		});

		// The reference quill declares ONE card kind, so the add trigger is the
		// single-kind button, whose accessible name is the kind it seeds.
		const add = target.querySelector('.qm-add-btn');
		expect(add?.getAttribute('aria-label')).toBe('Ajouter : Indorsement');

		// An untouched key still reads the package's English on the same surface.
		const titles = [...target.querySelectorAll('[title]')].map((el) => el.getAttribute('title'));
		expect(titles).toContain(DEFAULT_VISUAL_STRINGS.cardMoveUp);
	});

	it('re-renders when the wording changes under a live mount', () => {
		const { target, bag } = mountEditor({ strings: { addCardOfKind: () => 'FIRST' } });
		expect(target.querySelector('.qm-add-btn')?.getAttribute('aria-label')).toBe('FIRST');

		bag.strings = { addCardOfKind: () => 'SECOND' };
		flushSync();
		expect(target.querySelector('.qm-add-btn')?.getAttribute('aria-label')).toBe('SECOND');
	});
});

describe('formatDiagnostic', () => {
	const validation: Diagnostic = {
		severity: 'error',
		code: 'validation::must_fill',
		path: 'main.subject',
		message: 'subject must be filled'
	};

	it('takes the formatter when it words the diagnostic', () => {
		const format = (d: Diagnostic) =>
			d.code === 'validation::must_fill' ? `Champ requis : ${d.path}` : undefined;
		expect(diagnosticText(validation, format)).toBe('Champ requis : main.subject');
	});

	it('falls back to the message when the formatter declines', () => {
		// The parse lane: no `path`, no `location`, every parameter inside the English
		// message. A formatter routing on `code` has nothing to build from, and the
		// fallback is what keeps that honest instead of blanking the field.
		const parse: Diagnostic = {
			severity: 'error',
			code: 'parse::yaml_error_with_location',
			message: 'YAML error at line 3, column 5: unexpected key `foo`'
		};
		const format = (d: Diagnostic) => (d.code === 'validation::must_fill' ? 'reworded' : undefined);
		expect(diagnosticText(parse, format)).toBe(parse.message);
	});

	it('renders the formatted text and never the hint beside it', () => {
		// `hint` is the tail of the message it accompanies (the boundary asserts it),
		// so a surface rendering both shows one re-worded sentence with the engine's
		// English under it.
		const hint = 'Either provide a value of type `richtext` or change the schema.';
		const { target } = mountEditor({
			diagnostics: [
				{
					severity: 'error',
					code: 'validation::type_mismatch',
					path: 'main.subject',
					message: `field \`main.subject\` is \`richtext\` but the value is an array. ${hint}`,
					hint
				}
			],
			formatDiagnostic: () => 'Type incorrect'
		});
		const lines = [...target.querySelectorAll('.qm-diag-line')].map((n) => n.textContent);
		expect(lines).toContain('Type incorrect');
		expect(lines.some((t) => t?.includes('Either provide'))).toBe(false);
	});

	it('falls back with no formatter at all, and when code is absent', () => {
		expect(diagnosticText(validation, undefined)).toBe(validation.message);
		// `Diagnostic.code` is optional at this pin, so routing on it is not total by
		// type: a formatter that switches on `code` reaches its default arm here.
		const uncoded: Diagnostic = { severity: 'warning', message: 'backend said something' };
		expect(diagnosticText(uncoded, (d) => (d.code ? 'reworded' : undefined))).toBe(
			'backend said something'
		);
	});
});
