// The teardown order, at the reach a node suite has: a `Lifespan` is plain logic,
// so the window a destroy lands in is drivable here without a DOM. What is NOT
// here is the component wiring (a destroyed PM view, an unmounted array row):
// that needs a mounted surface, which is the playground's to drive.
import { describe, it, expect } from 'vitest';
import { createLifespan } from '$lib/core/teardown.js';

describe('Lifespan', () => {
	it('is alive until it ends', () => {
		const span = createLifespan();
		expect(span.alive).toBe(true);
		span.end();
		expect(span.alive).toBe(false);
	});

	it('drops a continuation whose surface ended inside the awaited window', async () => {
		const span = createLifespan();
		const landed: string[] = [];
		// The shape of every awaited-tick site: schedule, await the flush, act only
		// if the surface survived it.
		const flushed = span.resumes(Promise.resolve()).then((go) => {
			if (go) landed.push('acted');
		});
		span.end(); // the destroy, inside the window
		await flushed;
		expect(landed).toEqual([]);
	});

	it('resumes a continuation the surface outlives', async () => {
		const span = createLifespan();
		expect(await span.resumes(Promise.resolve())).toBe(true);
	});

	it('runs cancellers in registration order: unregister, cancel, then free', () => {
		const span = createLifespan();
		const ran: string[] = [];
		span.onEnd(() => ran.push('unregister'));
		span.onEnd(() => ran.push('cancel'));
		span.onEnd(() => ran.push('free'));
		span.end();
		expect(ran).toEqual(['unregister', 'cancel', 'free']);
	});

	it('is dead while its own cancellers run, so nothing they reach resumes', () => {
		const span = createLifespan();
		let seen: boolean | undefined;
		span.onEnd(() => (seen = span.alive));
		span.end();
		expect(seen).toBe(false);
	});

	it('ends once: a second end runs no canceller again', () => {
		const span = createLifespan();
		let runs = 0;
		span.onEnd(() => runs++);
		span.end();
		span.end();
		expect(runs).toBe(1);
	});

	it('runs a canceller registered after the end at once', () => {
		const span = createLifespan();
		span.end();
		let ran = false;
		span.onEnd(() => (ran = true));
		expect(ran).toBe(true);
	});
});
