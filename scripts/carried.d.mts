// Hand-written typings for `carried.mjs`, which quillkit's `vite.config.ts` imports from
// TypeScript. Signatures only: the prose is the script's, and a second copy of it here
// would drift against the one a reader of the implementation sees.

export function carried(root?: string): Record<string, string>;
export function line(what?: Record<string, string>): string;
