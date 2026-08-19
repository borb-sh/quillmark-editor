/**
 * The deploy as a reader reaches it: a site the bin laid, served under a subpath, opened
 * in a browser.
 *
 * It is the one test that loads what a consumer is served. Everything else here reads
 * built output as files — that a path exists, that a stylesheet survived the bundler —
 * and a client whose assets 404 or whose panes stand past the viewport passes all of it.
 * The dev server cannot exhibit either: it tree-shakes nothing and serves at a root.
 *
 * What it asserts is presence against absence, and relations no dial owns: the tracks of
 * a split sum to the shell they are in, and the shell is the viewport. Both hold at every
 * rung of every scale, so a retune leaves them green (CLAUDE.md §Verification).
 *
 * It runs against `dist/`, so it needs the package built, both halves.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { createStaticServer, listen } from '../serve.js';
import { scratch } from './helpers/collection.js';
import { load, type Viewport } from './helpers/browser.js';

const run = promisify(execFile);

const BIN = fileURLToPath(new URL('../../dist/bin/quillkit.js', import.meta.url));

/**
 * Two segments deep, which is the shape a project page is served at. A client that
 * resolved its assets or its quiver against the origin rather than the document's base
 * is whole at a root and blank here.
 */
const PREFIX = '/quillmark-js/studio';

/** Both sides of the preset's threshold: two tracks abreast, then one. */
const WIDE: Viewport = { width: 1440, height: 900 };
const NARROW: Viewport = { width: 700, height: 900 };

/** A pack, a browser start and a wasm load. */
const LOAD_MS = 120_000;

/**
 * What the page is asked, once it has settled. The load event fires before the client
 * has fetched anything of its own, so each handle is waited for: the shell is the mount,
 * the picker stands only over a resolved quiver, and the split only over an open
 * session.
 */
const PROBE = `(async () => {
	const deadline = Date.now() + 30000;
	const until = async (find) => {
		for (;;) {
			const found = find();
			if (found) return found;
			if (Date.now() > deadline) return null;
			await new Promise((wake) => setTimeout(wake, 50));
		}
	};
	const shell = await until(() => document.querySelector('.qm-workspace'));
	const picker = await until(() => document.querySelector('.picker'));
	const split = await until(() => document.querySelector('.qm-split'));
	const width = (el) => (el === null ? null : el.getBoundingClientRect().width);
	return {
		booted: shell !== null,
		quiverResolved: picker !== null,
		editorMounted: document.querySelector('.qm-pane') !== null,
		viewport: window.innerWidth,
		shellWidth: width(shell),
		splitWidth: width(split),
		panesLaid: split === null ? 0 : [...split.children].filter((p) => width(p) > 0).length
	};
})()`;

interface Probe {
	booted: boolean;
	quiverResolved: boolean;
	editorMounted: boolean;
	viewport: number;
	shellWidth: number | null;
	splitWidth: number | null;
	panesLaid: number;
}

const temp = scratch('quillkit-deploy-');
let server: Server;
let url: string;

beforeAll(async () => {
	expect(
		existsSync(BIN),
		`${BIN} is missing: run \`npm run build -w packages/quillkit\` first`
	).toBe(true);

	const site = join(await temp.dir(), 'site');
	await run(process.execPath, [BIN, 'site', '--quiver', await temp.collection(), '--out', site]);

	server = createStaticServer([{ prefix: PREFIX, root: site }]);
	const port = await listen(server, 0, '127.0.0.1');
	url = `http://127.0.0.1:${port}${PREFIX}/`;
}, LOAD_MS);

afterAll(async () => {
	server?.close();
	await temp.cleanup();
});

describe('the built client, served under a subpath', () => {
	it(
		'boots, resolves its quiver against the base it was served at, and mounts a surface',
		async () => {
			const page = await load<Probe>(url, PROBE, WIDE);

			expect(page.booted).toBe(true);
			expect(page.quiverResolved).toBe(true);
			expect(page.editorMounted).toBe(true);
		},
		LOAD_MS
	);

	it(
		'stands its tracks in the viewport, at both sides of the threshold',
		async () => {
			for (const viewport of [WIDE, NARROW]) {
				const page = await load<Probe>(url, PROBE, viewport);
				const where = `at ${viewport.width}px`;

				// The second assertion is the load-bearing one: `inset: 0` pins the shell's
				// box at the viewport whatever its tracks do, so a column sized to its
				// content overflows silently under the shell's own `overflow: hidden`.
				expect(page.shellWidth, `the shell is the viewport ${where}`).toBeCloseTo(page.viewport, 0);
				expect(page.splitWidth, `the tracks sum to the shell ${where}`).toBeCloseTo(
					page.shellWidth ?? 0,
					0
				);
			}
		},
		LOAD_MS
	);

	it(
		'shows both panes above the threshold and one under it',
		async () => {
			expect((await load<Probe>(url, PROBE, WIDE)).panesLaid).toBe(2);
			expect((await load<Probe>(url, PROBE, NARROW)).panesLaid).toBe(1);
		},
		LOAD_MS
	);
});
