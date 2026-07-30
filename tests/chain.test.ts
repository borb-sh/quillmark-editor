// Drive the whole substrate chain end-to-end against the reference quill:
// fixture tree → Quill.fromTree → seedDocument → Engine.open → LiveSession, and
// prove handles free without leaking across repeated cycles. Runs in Node against
// the real Typst backend (no browser, no canvas). Imports the surface through
// `$lib/core` exactly as a consumer does.
import { describe, it, expect } from 'vitest';
import { Engine, Quill, init } from '$lib/core';
import { loadFixtureTree } from './helpers/fixtures.js';

describe('substrate chain', () => {
	it('loads the fixture, seeds a document, opens a session', async () => {
		init();
		const tree = loadFixtureTree();
		expect(tree.size).toBeGreaterThan(0);
		expect(tree.has('Quill.yaml')).toBe(true);

		const quill = Quill.fromTree(tree);
		expect(quill.metadata.name).toBe('usaf_memo');
		expect(quill.backendId).toBe('typst');
		expect(Object.keys(quill.schema.main.fields).length).toBeGreaterThan(0);
		expect(quill.schema.card_kinds).toHaveProperty('indorsement');

		const doc = quill.seedDocument();
		// Composed from the quill's own metadata; the contract is `name@version`,
		// not the version the fixture happens to sit at.
		expect(doc.quillRef).toBe(`${quill.metadata.name}@${quill.metadata.version}`);

		const engine = new Engine();
		expect(await engine.supportsCanvas(quill)).toBe(true);

		const session = await engine.open(quill, doc);
		// The exit criteria's three reported quantities.
		expect(session.pageCount).toBeGreaterThan(0);
		expect(session.supportsCanvas).toBe(true);
		expect(Array.isArray(session.warnings)).toBe(true);

		session.free();
		doc.free();
		quill.free();
	});

	it('preserves binary fixture bytes (fonts/seals arrive as raw bytes)', () => {
		const tree = loadFixtureTree();
		const seal = tree.get('assets/dow_seal.png');
		expect(seal).toBeInstanceOf(Uint8Array);
		// PNG magic number; proves the byte path did not decode/re-encode as text.
		expect(Array.from(seal!.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});

	it('opens and frees repeatedly without a handle leak', async () => {
		const tree = loadFixtureTree();
		const quill = Quill.fromTree(tree);
		const engine = new Engine();
		// Repeated open/close on one cached quill clone; a leak or use-after-free
		// would surface as a throw or a corrupt compile by the last iteration.
		for (let i = 0; i < 5; i++) {
			const doc = quill.seedDocument();
			const session = await engine.open(quill, doc);
			expect(session.pageCount).toBeGreaterThan(0);
			session.free();
			doc.free();
		}
		quill.free();
	});
});
