// The empty body's ghost: the three-way precedence `resolveBodyGhost` settles
// (resolved `default:` › consumer wording › the built-in invitation), and the
// fixture fact that motivates the fallback existing at all — the reference quill
// declares NO body `default:` on any kind, so the resolved channel is empty for
// exactly the cards a user adds. The caching that makes an impure hook read as
// deliberate is the editor's, asserted in the playground; here the pure
// resolution is pinned.
import { describe, it, expect } from 'vitest';
import {
	DEFAULT_BODY_PLACEHOLDER,
	resolveBodyGhost,
	ghostDefault,
	stringifyGhost
} from '$lib/visual/structure';
import { quill } from '../helpers/fixtures.js';

describe('resolveBodyGhost', () => {
	it('prefers a resolved `default:` over both the consumer and the built-in', () => {
		// The default is the only ghost that describes the render, so wording never
		// displaces it — a consumer cannot hide what prints when nothing is written.
		expect(resolveBodyGhost('THE DEFAULT', 'witty')).toBe('THE DEFAULT');
	});

	it('takes consumer wording when there is no default', () => {
		expect(resolveBodyGhost(undefined, 'Say something unforgettable…')).toBe(
			'Say something unforgettable…'
		);
	});

	it('falls back to the built-in with no default and no consumer', () => {
		expect(resolveBodyGhost(undefined, undefined)).toBe(DEFAULT_BODY_PLACEHOLDER);
	});

	it('treats a hook that declines or returns empty as absent', () => {
		// `undefined` is the documented "defer to the package" answer; an empty
		// string is the same intent expressed badly, and must not blank the leaf.
		expect(resolveBodyGhost(undefined, undefined)).toBe(DEFAULT_BODY_PLACEHOLDER);
		expect(resolveBodyGhost(undefined, '')).toBe(DEFAULT_BODY_PLACEHOLDER);
		// Likewise an empty resolved default falls through rather than winning.
		expect(resolveBodyGhost('', 'witty')).toBe('witty');
	});

	it('never yields empty — a body leaf always has something to invite into it', () => {
		for (const [d, c] of [
			['', ''],
			[undefined, ''],
			['', undefined],
			[undefined, undefined]
		] as const)
			expect(resolveBodyGhost(d, c)).toBe(DEFAULT_BODY_PLACEHOLDER);
	});
});

describe('the reference quill body channel', () => {
	it('resolves NO body default on main — the fallback is the common case, not the edge', () => {
		const doc = quill().seedDocument();
		const body = quill().resolve(doc).main.body;
		expect(stringifyGhost(ghostDefault(body ?? undefined))).toBeUndefined();
		expect(resolveBodyGhost(stringifyGhost(ghostDefault(body ?? undefined)), undefined)).toBe(
			DEFAULT_BODY_PLACEHOLDER
		);
	});

	it('resolves no body default for a freshly added indorsement either', () => {
		// The exact sequence `addCard` runs, against the real schema.
		const q = quill();
		const doc = q.seedDocument();
		const card = q.seedCard('indorsement', doc.seedOverlay('indorsement'));
		expect(card).toBeTruthy();
		doc.insertCard(card!, doc.cardCount);

		const resolved = q.resolve(doc).cards.at(-1);
		expect(resolved?.kind).toBe('indorsement');
		expect(stringifyGhost(ghostDefault(resolved?.body ?? undefined))).toBeUndefined();
	});
});
