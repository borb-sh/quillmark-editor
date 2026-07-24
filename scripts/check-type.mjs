// Type-scale lint — enforces THEMING §"Base — typography & text" in code: font
// size and weight on the visual surfaces read the closed `--_qm-text-*` /
// `--_qm-weight-*` scale, they do not mint a literal (SURFACES §"Preventing
// drift": "a component reads a token, it does not mint a value"). The geometry
// sibling `check-geometry.mjs` already guards where `--_qm-*` is DEFINED (mint
// roots only), so this check owns only the CONSUMPTION side, over
// `src/lib/visual/**/*.svelte` `<style>` blocks:
//   1. No bare size literal in `font-size` — a `var(--_qm-text-…)` rung is the
//      only value (title / body / label / meta).
//   2. No bare weight literal in `font-weight` — a `var(--_qm-weight-…)` rung is
//      the only value (label 600 / soft 500); the CSS-wide keywords
//      inherit/initial/unset are allowed (they carry no scale decision).
// The `font` shorthand, line-height, and font-family are out of scope — not the
// size/weight ramp, not matched. Zero deps; run via `npm run check:type`.
// THEMING §"Base — typography & text" documents the two public dials.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VISUAL = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'lib', 'visual');
const LENGTH = /\b\d*\.?\d+(px|rem|em)\b/;
// A weight literal: a numeric weight (100–900) or the bold/lighter keywords. The
// CSS-wide keywords carry no hierarchy decision, so they are not a scale escape.
const WEIGHT_LITERAL = /\b(\d{3}|bold|bolder|lighter|normal)\b/;
const READS_RUNG = /var\(--_qm-/;

const errors = [];
const files = readdirSync(VISUAL)
	.filter((f) => f.endsWith('.svelte'))
	.sort();

for (const file of files) {
	const rel = `src/lib/visual/${file}`;
	const text = readFileSync(join(VISUAL, file), 'utf8');
	const fail = (msg) => errors.push(`${rel}: ${msg}`);

	// Only lint inside <style> — script/markup literals are none of our business.
	const style = text.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1];
	if (!style) continue;
	const base = text.slice(0, text.indexOf(style)).split('\n').length - 1; // 1-based line of style start

	style.split('\n').forEach((line, i) => {
		const ln = base + i + 1;
		const decl = line.match(/^\s*([\w-]+)\s*:\s*([^;]*)/);
		if (!decl) return;
		const [, prop, value] = decl;
		if (prop === 'font-size' && LENGTH.test(value) && !READS_RUNG.test(value))
			fail(
				`line ${ln}: \`font-size\` mints a literal — read a \`var(--_qm-text-…)\` rung (THEMING §Typography)`
			);
		if (prop === 'font-weight' && WEIGHT_LITERAL.test(value) && !READS_RUNG.test(value))
			fail(
				`line ${ln}: \`font-weight\` mints a literal — read a \`var(--_qm-weight-…)\` rung (THEMING §Typography)`
			);
	});
}

if (errors.length) {
	console.error(`Type-scale check failed (${errors.length}):`);
	for (const e of errors) console.error(`  ✗ ${e}`);
	process.exit(1);
}
console.log(`Type scale OK — ${files.length} surface components.`);
