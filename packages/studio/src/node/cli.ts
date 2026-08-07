#!/usr/bin/env node
/**
 * Studio CLI — the quill author's local loop and the site their deploy serves. Two
 * verbs, and they are the whole of it: `quiver test` and `quiver build` stay where they
 * are, and this absorbs neither.
 *
 * Commands:
 *   studio dev  [--quiver <dir>] [--out <dir>] [--port <n>] [--host <addr>]
 *   studio site [--quiver <dir>] [--out <dir>]
 *
 * Nothing here instantiates an engine. The packer is the collection's own
 * (`collection.ts`), the client is a static asset (`client.ts`), and the one wasm in
 * this picture is the copy bundled into the client, in a browser tab, in a process this
 * one never shares.
 */

import { join, resolve } from 'node:path';
import { CLIENT_DIST } from './client.js';
import { createPacker, watchCollection } from './pack.js';
import { createStaticServer, listen, type Mount } from './serve.js';
import { laySite } from './site.js';

const argv = process.argv.slice(2);
const command = argv[0];

/** One flag with a value. */
function flag(name: string): string | undefined {
	const i = argv.indexOf(name);
	return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/** The collection, defaulting to the working directory as `quiver build` does. */
const collection = (): string => resolve(flag('--quiver') ?? '.');

// ---------------------------------------------------------------------------
// dev
// ---------------------------------------------------------------------------

async function dev(): Promise<void> {
	const source = collection();
	// Under the collection's `node_modules` by default, which is both out of the way
	// and already excluded from the watch.
	const out = resolve(flag('--out') ?? join(source, 'node_modules', '.studio', 'quiver'));
	const stage = `${out}.stage`;
	const port = Number(flag('--port') ?? 5174);
	const host = flag('--host') ?? 'localhost';

	if (!Number.isInteger(port) || port < 0 || port > 65535)
		throw new Error(`--port must be a port number, got "${flag('--port')}"`);

	const packer = await createPacker({ collection: source, out, stage });
	// Before the server, so the first request finds a whole generation rather than an
	// empty directory.
	await packer.pack();

	const mounts: Mount[] = [
		{ prefix: '/quiver', root: out },
		{ prefix: '', root: CLIENT_DIST }
	];
	const bound = await listen(createStaticServer(mounts), port, host);

	const watcher = watchCollection(source, [out, stage], () => {
		packer.pack().then(
			() => console.log('repacked'),
			// A quiver mid-edit is invalid as often as not (a half-written `Quill.yaml`).
			// A failed pack never reaches the swap, so the last good generation stays
			// served and the failure is a line rather than an exit.
			(err: unknown) => console.error(`pack failed: ${message(err)}`)
		);
	});
	for (const signal of ['SIGINT', 'SIGTERM'] as const)
		process.on(signal, () => {
			watcher.close();
			process.exit(0);
		});

	console.log(`studio dev: http://${host}:${bound}/`);
	console.log(`  quiver:   ${source}`);
	console.log('  reload the page to pick up a repack.');
}

// ---------------------------------------------------------------------------
// site
// ---------------------------------------------------------------------------

async function site(): Promise<void> {
	const source = collection();
	const at = await laySite({ collection: source, out: flag('--out') ?? 'site' });
	console.log(`studio site: ${at}`);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

function usage(): void {
	console.error(
		[
			'Usage:',
			'  studio dev  [--quiver <dir>] [--out <dir>] [--port <n>] [--host <addr>]',
			'  studio site [--quiver <dir>] [--out <dir>]'
		].join('\n')
	);
}

function die(err: unknown): never {
	console.error(`error: ${message(err)}`);
	process.exit(1);
}

switch (command) {
	case 'dev':
		dev().catch(die);
		break;
	case 'site':
		site().catch(die);
		break;
	default:
		usage();
		process.exit(1);
}
