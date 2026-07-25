// Geometry-scale lint — enforces SURFACES §Rhythm in code: radius and spacing on
// the visual surfaces read the closed `--_qm-*` scale, they do not mint a literal
// (§"Preventing drift": "a component reads a token, it does not mint a value").
// One rule, over `src/lib/visual/**/*.svelte` `<style>` blocks: no bare length
// literal in a rhythm property — border-radius, gap/row-gap/column-gap,
// padding(-*), margin(-*). A `var(--_qm-…)` is the only value. Where the scale
// may be DEFINED is `check-theme.mjs`'s rule 3, which owns that question for all
// three axes at once (one derivation, `src/lib/core/theme.ts`).
// Border widths (`1px` hairlines), shadows, transitions, and content sizing
// (min-height/width) are out of scope — not rhythm, not matched. Zero deps; run
// via `npm run check:geometry`. THEMING §Geometry documents the public dials.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VISUAL = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'visual');
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
	});
}

if (errors.length) {
	console.error(`Geometry-scale check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(`Geometry scale OK — ${files.length} surface components.`);
