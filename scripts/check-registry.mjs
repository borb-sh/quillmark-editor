// Every published package's version against the registry's copy of it. A version this
// branch carries that the registry does not have is a release that did not happen: a run
// evicted from the concurrency queue, a publish that failed, a bump merged by hand. The
// number is spent whichever it was, since the next `release-prepare` bumps from it, so the
// drift is named rather than waited out. Zero deps; run via `npm run check:registry`.
//
// Not part of `gate`, and the reason is the release PR: it carries a bump the registry
// cannot have yet, and on that branch the drift IS the change. On `main` the same fact is
// a fault, so this runs on its own schedule (`registry.yml`) rather than on every push,
// which also keeps it clear of the release run it would otherwise race.
//
// The exact version rather than `latest`: a package releasing a patch on an older line
// serves a `latest` that is legitimately not what this branch holds, and asking for one
// version answers the only question here, which is whether this one is published.

import { execFileSync } from 'node:child_process';
import { packages, report } from './workspace.mjs';

/** `npm view <spec> version`, or `undefined` where the registry has no such version. */
function published(spec) {
	try {
		return execFileSync('npm', ['view', spec, 'version'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return undefined;
	}
}

const errors = [];
const checked = [];

for (const { json } of packages()) {
	if (json.private === true) continue;
	checked.push(json.name);
	const spec = `${json.name}@${json.version}`;
	if (published(spec) !== json.version)
		errors.push(
			`${spec} is on this branch and not on the registry — the release for it never landed`
		);
}

report(
	'Registry drift check',
	errors,
	`Registry OK — ${checked.length} published packages, every version on this branch is on the registry.`
);
