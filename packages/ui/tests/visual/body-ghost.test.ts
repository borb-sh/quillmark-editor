// The empty body's ghost: the three-way precedence `resolveBodyGhost` settles
// (resolved `default:` › consumer wording › the built-in invitation), and the
// fixture fact that motivates the fallback existing at all; the reference quill
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
		// displaces it; a consumer cannot hide what prints when nothing is written.
		expect(resolveBodyGhost('THE DEFAULT', 'witty')).toBe('THE DEFAULT');
	});

	it('takes consumer wording when there is no default', () => {
		expect(resolveBodyGhost(undefined, 'Say something unforgettable…')).toBe(
			'Say something unforgettable…'
		);
	});

	it('never yields empty — a body leaf always has something to invite into it', () => {
		// `undefined` is the documented "defer to the package" answer from a consumer
		// hook; an empty string is the same intent expressed badly, and an empty
		// resolved default falls through rather than winning. No combination blanks
		// the leaf.
		expect(resolveBodyGhost('', 'witty')).toBe('witty');
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
	it('resolves no body default on main, nor on a freshly added indorsement', () => {
		// The add path is the exact sequence `addCard` runs, against the real schema.
		const q = quill();
		const doc = q.seedDocument();
		const card = q.seedCard('indorsement', doc.seedOverlay('indorsement'));
		expect(card).toBeTruthy();
		doc.insertCard(card!, doc.cardCount);

		const resolved = q.resolve(doc);
		expect(resolved.cards.at(-1)?.kind).toBe('indorsement');
		for (const body of [resolved.main.body, resolved.cards.at(-1)?.body]) {
			const ghost = stringifyGhost(ghostDefault(body ?? undefined));
			expect(ghost).toBeUndefined();
			expect(resolveBodyGhost(ghost, undefined)).toBe(DEFAULT_BODY_PLACEHOLDER);
		}
	});
});
