// `@quillmark/editor` root — the framework-free substrate.
//
// The headline surfaces mount from their own subpaths (`@quillmark/editor/preview`,
// `/visual`, `/source`) so a bundler pulls only what an entry reaches; the root is
// the shared `/core` boundary — the WASM handles, the corpus codec primitives, and
// every boundary type — re-exported for a consumer that wants one import for the
// substrate. It carries no framework code.
export * from './core/index.js';
