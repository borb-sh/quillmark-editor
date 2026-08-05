#!/usr/bin/env node
/**
 * `npx @quillmark/studio` in a quiver root: pack it, serve it, watch it.
 *
 * The cwd convention `quiver build` and `quiver test` already use, so the three moves
 * an author has over a quiver — pack it, gate it, look at it — are asked for the same
 * way. Nothing here is a gate: `quiver test` is what a build is blocked on, and
 * nothing fails on studio's verdict.
 *
 * Usage:
 *   studio [--port <n>]
 */

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStudio } from './studio.js';
import { resolveWasm } from './wasm.js';

const DEFAULT_PORT = 4321;

const argv = process.argv.slice(2);

function flag(name: string): string | undefined {
	const i = argv.indexOf(name);
	return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function die(message: string): never {
	console.error(`error: ${message}`);
	process.exit(1);
}

if (argv.includes('--help') || argv.includes('-h')) {
	console.log(['Usage:', '  studio [--port <n>]'].join('\n'));
	process.exit(0);
}

const port = Number(flag('--port') ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535)
	die(`--port ${flag('--port')} is not a port`);

const cwd = process.cwd();
if (!existsSync(join(cwd, 'Quiver.yaml')))
	die(
		`no Quiver.yaml here — studio runs in a quiver root, beside the quills/ it holds.\n` +
			`  Looked in:  ${cwd}`
	);

// The package's own manifest: its version for the banner, and the peer floor the
// prebuilt client was built against, which is what the author's copy is held to.
const manifest = JSON.parse(
	readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')
) as { version: string; peerDependencies: Record<string, string> };

let wasm;
try {
	wasm = resolveWasm(cwd, manifest.peerDependencies['@quillmark/wasm']);
} catch (err) {
	die(err instanceof Error ? err.message : String(err));
}

const studio = createStudio({
	source: cwd,
	// Beside the artifact it serves, on the same filesystem as the source: the swap
	// is a rename, and `node_modules` is what the watch already ignores.
	home: join(cwd, 'node_modules', '.studio'),
	client: fileURLToPath(new URL('../client', import.meta.url)),
	wasm,
	onError: (err) =>
		console.error(`quiver pack failed: ${err instanceof Error ? err.message : String(err)}`)
});

try {
	await studio.ready;
} catch (err) {
	studio.close();
	die(`cannot pack this quiver: ${err instanceof Error ? err.message : String(err)}`);
}

const server = createServer((req, res) => {
	studio.middleware(req, res, () => {
		res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
		res.end('not found');
	});
});

server.on('error', (err: NodeJS.ErrnoException) => {
	studio.close();
	if (err.code === 'EADDRINUSE') die(`port ${port} is taken — pass --port <n> for another`);
	die(err.message);
});

// Localhost alone: the served trees are the author's own disk, the packed quiver and
// the artifact beside it, and nothing here authenticates a reader.
server.listen(port, '127.0.0.1', () => {
	console.log(
		[
			`quillmark/studio ${manifest.version}`,
			`  quiver  ${cwd}`,
			`  wasm    ${wasm.version}`,
			'',
			`  http://127.0.0.1:${port}/`,
			''
		].join('\n')
	);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
	process.on(signal, () => {
		studio.close();
		server.close(() => process.exit(0));
		// A held-open event stream would keep the server from closing on its own.
		process.exit(0);
	});
