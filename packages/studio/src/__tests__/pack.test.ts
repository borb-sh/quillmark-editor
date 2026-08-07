/**
 * The packing loop: the staged swap a client reads under, and the watch filter that
 * keeps a pack from feeding itself.
 *
 * The swap is what a client depends on and what nothing else in the workspace proves.
 * `build` clears its output before writing it, so the window this closes is real and
 * one rename wide.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createPacker, settle, within } from '../node/pack.js';
import { scratch } from './helpers/collection.js';

const temp = scratch('studio-pack-');
afterEach(() => temp.cleanup());

/** The pointer's manifest name, which moves whenever the packed content does. */
async function pointerOf(out: string): Promise<string> {
	const raw = await readFile(join(out, 'latest.json'), 'utf8');
	return (JSON.parse(raw) as { manifest: string }).manifest;
}

/** Rename the collection, which is the smallest edit that moves the manifest's hash. */
async function rename(collection: string, name: string): Promise<void> {
	const meta = join(collection, 'Quiver.yaml');
	const text = await readFile(meta, 'utf8');
	await writeFile(meta, text.replace(/^name: .*$/m, `name: ${name}`));
}

describe('the packer', () => {
	it('packs a collection into the served tree', async () => {
		const collection = await temp.collection();
		const out = join(await temp.dir(), 'quiver');
		const packer = await createPacker({ collection, out, stage: join(await temp.dir(), 'stage') });
		await packer.pack();

		expect(existsSync(join(out, 'latest.json'))).toBe(true);
		expect(await pointerOf(out)).toMatch(/^manifest\.[0-9a-f]{12}\.json$/);
	});

	it('leaves no staging tree behind', async () => {
		// The stage holds a generation mid-assembly and the one it replaced. Both are
		// gone by the time a pack resolves, so a repack loop does not grow a disk.
		const collection = await temp.collection();
		const stage = join(await temp.dir(), 'stage');
		const packer = await createPacker({ collection, out: join(await temp.dir(), 'quiver'), stage });
		await packer.pack();
		await packer.pack();

		expect(existsSync(join(stage, 'next'))).toBe(false);
		expect(existsSync(join(stage, 'prev'))).toBe(false);
	});

	it('a repack replaces the generation whole', async () => {
		const collection = await temp.collection();
		const out = join(await temp.dir(), 'quiver');
		const packer = await createPacker({ collection, out, stage: join(await temp.dir(), 'stage') });
		await packer.pack();
		const before = await pointerOf(out);

		await rename(collection, 'renamed');
		await packer.pack();

		const after = await pointerOf(out);
		expect(after).not.toBe(before);
		// Every name the new pointer reaches has landed: a swap moves a whole tree in,
		// so a client never reads a manifest whose bundles are not there yet.
		const manifest = JSON.parse(await readFile(join(out, after), 'utf8')) as {
			quills: { bundle: string }[];
		};
		expect(manifest.quills.length).toBeGreaterThan(0);
		for (const quill of manifest.quills) expect(existsSync(join(out, quill.bundle))).toBe(true);
	});

	it('a failed pack keeps the last good generation, and the next pack still runs', async () => {
		// The regression this pins: a serialized queue that chains onto its own result
		// answers every later pack with the FIRST failure instead of running it, so one
		// half-written `Quiver.yaml` ends the loop until the process restarts.
		const collection = await temp.collection();
		const out = join(await temp.dir(), 'quiver');
		const packer = await createPacker({ collection, out, stage: join(await temp.dir(), 'stage') });
		await packer.pack();
		const good = await pointerOf(out);

		const meta = join(collection, 'Quiver.yaml');
		const valid = await readFile(meta, 'utf8');
		await writeFile(meta, 'name: [unclosed');
		await expect(packer.pack()).rejects.toThrow();
		await expect(packer.pack()).rejects.toThrow();
		expect(await pointerOf(out)).toBe(good);

		await writeFile(meta, valid);
		await rename(collection, 'recovered');
		await packer.pack();
		expect(await pointerOf(out)).not.toBe(good);
	});
});

describe('the watch filter', () => {
	it('the output a pack writes is not a source change', () => {
		// The default output lives under the collection's `node_modules`, so a watcher
		// that saw its own writes would repack forever.
		expect(within('/c/node_modules/.studio/quiver', '/c/node_modules/.studio/quiver/x')).toBe(true);
		expect(within('/c/out', '/c/out')).toBe(true);
		expect(within('/c/out', '/c/quills/memo/1.0.0/Quill.yaml')).toBe(false);
		// A sibling whose name merely starts the same is outside it.
		expect(within('/c/out', '/c/outside/x')).toBe(false);
	});
});

describe('settle', () => {
	it('fires once for a burst', async () => {
		let calls = 0;
		const fire = settle(10, () => calls++);
		for (let i = 0; i < 5; i++) fire();
		await new Promise((ok) => setTimeout(ok, 40));
		expect(calls).toBe(1);
	});
});
