// The stated pin against the installed one. `DOCUMENT_MODEL.md` is the single place the
// `@quillmark/wasm` version coupling is recorded, so the number in the prose answers to
// the number on disk — the one claim in that doc nothing else can check, since a bump
// lands in the lockfile and leaves the sentence about it untouched. Zero deps; run via
// `npm run check:ledger`.
//
// Only an adjacent pair is read: the doc cites other releases historically ("0.100.0
// extended it to the content model"), and those are prose about the past, not a claim
// about this install.
//
// What the ledger's TABLE names is left to `tsc`, which fails on a verb the artifact
// stopped exporting the moment package code calls it, and to review for a row that
// outlives its consumer.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ROOT, report } from './workspace.mjs';

const LEDGER = 'packages/svelte/prose/canon/DOCUMENT_MODEL.md';

const errors = [];
const doc = readFileSync(join(ROOT, LEDGER), 'utf8');

// The artifact exports one entry and no `./package.json`, so its root is reached through
// the entry rather than resolved directly, as `carried.mjs` reaches it.
const require = createRequire(join(ROOT, 'package.json'));
const pkgDir = join(dirname(require.resolve('@quillmark/wasm')), '..');
const installed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;

const pins = [...doc.matchAll(/`@quillmark\/wasm`\s+(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
for (const pin of pins)
	if (pin !== installed)
		errors.push(`${LEDGER}: states @quillmark/wasm ${pin}; ${installed} is installed`);
if (pins.length === 0)
	errors.push(`${LEDGER}: names no @quillmark/wasm version — the pin is recorded here or nowhere`);

report('Boundary pin check', errors, `Boundary pin OK — @quillmark/wasm ${installed}.`);
