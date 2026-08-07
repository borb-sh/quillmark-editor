/** True when `at` is `abs` or an ancestor of it. The containment three refusals turn
 *  on: a watcher's own output, a server's mount, and an out that owns its input. */

import { isAbsolute, relative } from 'node:path';

export function within(at: string, abs: string): boolean {
	const rel = relative(at, abs);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
