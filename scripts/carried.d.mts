/** What a client built out of `root` compiles in, keyed by registry name. */
export function carried(root?: string): Record<string, string>;

/** The same versions as one sentence, for a release's notes. */
export function line(what?: Record<string, string>): string;
