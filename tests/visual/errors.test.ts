// @vitest-environment jsdom
// The error channel (`core/errors.ts`): every surface reports what it recovered
// from through one handler, and reports to the console only when the consumer took
// no channel. What is asserted is the CONTRACT — a code a consumer can switch on,
// the thrown cause verbatim, and the console left alone — not the wording.
import { describe, it, expect, vi } from 'vitest';
import { reportError } from '$lib/core/errors';
import type { EditorError } from '$lib/core';
import { createSourceView } from '$lib/source/view';
import type { Document } from '$lib/core';

/** A document whose serialize throws: the source mirror's one recoverable failure. */
function brokenDoc(): Document {
	return {
		toMarkdown() {
			throw new Error('boundary refused');
		}
	} as unknown as Document;
}

describe('the error channel', () => {
	it('reports to the handler, and NOT to the console, when one is given', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const seen: EditorError[] = [];
		reportError((e) => seen.push(e), { code: 'paint', message: 'x', cause: 1, page: 3 });
		expect(seen).toHaveLength(1);
		expect(seen[0].page).toBe(3);
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it('falls back to the console line the call site used to write', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		reportError(undefined, { code: 'paint', message: 'preview paint failed for page 3' });
		expect(spy).toHaveBeenCalledOnce();
		expect(String(spy.mock.calls[0][0])).toContain('[quillmark/editor]');
		spy.mockRestore();
	});

	it('routes a source-view serialize failure, and still shows the error in place', () => {
		const seen: EditorError[] = [];
		const container = document.createElement('div');
		document.body.appendChild(container);
		const view = createSourceView({
			container,
			doc: brokenDoc(),
			onError: (e) => seen.push(e)
		});
		expect(seen.map((e) => e.code)).toEqual(['serialize']);
		expect(seen[0].cause).toBeInstanceOf(Error);
		// Recovered, not crashed: the mirror says so where the markdown would be.
		expect(container.textContent).toContain('boundary refused');
		view.destroy();
	});
});
