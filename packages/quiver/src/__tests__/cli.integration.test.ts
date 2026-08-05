/**
 * The gate, run as an author runs it: the built `dist/bin/quiver.js`, spawned in a
 * quiver root, against the workspace's reference quill.
 *
 * Every other test in the suite imports `src/`, which is what makes this one worth its
 * seconds: what an author reaches is a linked bin, and nothing that imports a module
 * proves one works. It pins engine discovery, instantiating the core, the source load,
 * and a real render of every quill's seeded example, that last being what a gate for
 * quills is.
 *
 * It runs against `dist/`, so it needs the package built. `npm ci` builds it through
 * `prepare`, which is what CI does before it tests.
 */

import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

/** The bin as npm links it, not the TypeScript behind it. */
const BIN = fileURLToPath(new URL('../../dist/bin/quiver.js', import.meta.url));

/** The workspace's reference quiver: `usaf_memo@0.2.0`, one quill at one version. */
const REFERENCE_QUIVER = fileURLToPath(new URL('../../../../fixtures', import.meta.url));

/** A real Typst backend load and one page compiled. */
const RENDER_MS = 120_000;

describe('the author-side gate', () => {
	it(
		'gates the reference quiver end-to-end',
		async () => {
			expect(
				existsSync(BIN),
				`${BIN} is missing: run \`npm run build -w packages/quiver\` first`
			).toBe(true);

			// A non-zero exit rejects, carrying the gate's own output as the failure.
			const { stdout } = await run(process.execPath, [BIN, 'test'], { cwd: REFERENCE_QUIVER });

			expect(stdout).toContain('pass  usaf_memo@0.2.0');
			expect(stdout).toContain('1/1 passed');
		},
		RENDER_MS
	);
});
