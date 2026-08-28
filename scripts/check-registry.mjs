// Every published package's version against the registry's copy of it. A version this
// branch carries that the registry does not have is a release that did not happen: a run
// evicted from the concurrency queue, a publish that failed, a bump merged by hand. The
// version number is spent either way, since the next `release-prepare` bumps from it, so
// the drift is named rather than waited out. Zero deps; run via `npm run check:registry`.
//
// Not part of `gate`: the release PR carries a bump the registry cannot have yet, and on
// that branch the drift is the change. On `main` the same fact is a fault, so this runs on
// its own schedule (`registry.yml`), which also keeps it clear of the release run a
// push-triggered check would race.
//
// The exact version rather than `latest`: a package releasing a patch on an older line
// serves a `latest` that is legitimately not what this branch holds, and whether this
// version is published is the whole question.

import { execFileSync } from 'node:child_process';
import { packages, report } from './workspace.mjs';

/**
 * What `npm view <spec> version` answers: `{ version }` where the registry serves it,
 * `{ absent: true }` where it says E404, and `{ unknown }` for anything else it said.
 *
 * Three answers rather than two: a DNS failure, a 5xx, a proxy, an expired token or a
 * missing `npm` all exit non-zero, and read as absence they report every published
 * package at once — which reads as a catastrophic release failure rather than as the
 * outage it is.
 */
function published(spec) {
	try {
		return {
			version: execFileSync('npm', ['view', spec, 'version'], {
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe']
			}).trim()
		};
	} catch (err) {
		const said = `${err.stderr ?? ''}`.trim();
		if (/E404/.test(said)) return { absent: true };
		return { unknown: said || err.message };
	}
}

const errors = [];
const checked = [];

for (const { json } of packages()) {
	if (json.private === true) continue;
	checked.push(json.name);
	const spec = `${json.name}@${json.version}`;
	const answer = published(spec);
	if (answer.unknown !== undefined)
		errors.push(`${spec} could not be read from the registry — npm said: ${answer.unknown}`);
	else if (answer.absent || answer.version !== json.version)
		errors.push(
			`${spec} is on this branch and not on the registry — the release for it never landed`
		);
}

report(
	'Registry drift check',
	errors,
	`Registry OK — ${checked.length} published packages, every version on this branch is on the registry.`
);
