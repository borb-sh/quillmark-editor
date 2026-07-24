// Geometry-scale lint — enforces SURFACES §Rhythm in code: radius and spacing on
// the visual surfaces read the closed `--_qm-*` scale, they do not mint a literal
// (§"Preventing drift": "a component reads a token, it does not mint a value").
// Two rules, over `src/lib/visual/**/*.svelte` `<style>` blocks:
//   1. No bare length literal in a rhythm property — border-radius, gap/row-gap/
//      column-gap, padding(-*), margin(-*). A `var(--_qm-…)` is the only value.
//   2. The scale is minted in ONE place per detached root. `--_qm-*` is DEFINED
//      only in the two roots that carry the derivation block (VisualEditor, and
//      FormatPopover — it portals out of the editor subtree); elsewhere it is only
//      consumed. A third definition is the drift a closed scale exists to prevent.
// Border widths (`1px` hairlines), shadows, transitions, and content sizing
// (min-height/width) are out of scope — not rhythm, not matched. Zero deps; run
// via `npm run check:geometry`. THEMING §Geometry documents the public dials.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VISUAL = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'visual');
// The roots that carry the derivation block — the only files allowed to mint `--_qm-*`.
const MINT_ROOTS = new Set(['VisualEditor.svelte', 'FormatPopover.svelte']);
// The rhythm properties whose values must come from the scale, not a literal.
const RHYTHM_PROP =
	/^(border-radius|gap|row-gap|column-gap|padding|margin)(-(top|bottom|left|right))?$/;
const LENGTH = /\b\d*\.?\d+(px|rem)\b/;

const errors = [];
const files = readdirSync(VISUAL)
	.filter((f) => f.endsWith('.svelte'))
	.sort();

for (const file of files) {
	const rel = `src/lib/visual/${file}`;
	const text = readFileSync(join(VISUAL, file), 'utf8');
	const fail = (msg) => errors.push(`${rel}: ${msg}`);

	// Only lint inside <style> — script/markup literals (positions, timeouts) are none of our business.
	const style = text.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1];
	if (!style) continue;
	const base = text.slice(0, text.indexOf(style)).split('\n').length - 1; // 1-based line of style start

	style.split('\n').forEach((line, i) => {
		const ln = base + i + 1;
		const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
		if (!decl) return;
		const [, prop, value] = decl;
		if (RHYTHM_PROP.test(prop) && LENGTH.test(value))
			fail(
				`line ${ln}: \`${prop}\` mints a literal — read a \`var(--_qm-…)\` rung (SURFACES §Rhythm)`
			);
		if (/^--_qm-/.test(prop) && !MINT_ROOTS.has(file))
			fail(
				`line ${ln}: defines \`${prop}\` — the scale is minted only in ${[...MINT_ROOTS].join(', ')}`
			);
	});
}

if (errors.length) {
	console.error(`Geometry-scale check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(`Geometry scale OK — ${files.length} surface components.`);
