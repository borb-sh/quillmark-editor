// Main browser-safe entrypoint.
//
// Exposes only browser-safe surface. Node-only factories
// (`Quiver.fromDir`, `fromPackage`, `build`) and the `BuildOptions` type
// live at `@quillmark/quiver/node`.
export { QuiverError } from "./errors.js";
export type { QuiverErrorCode } from "./errors.js";
export { Quiver } from "./quiver.js";

// Engine types (`Quillmark`, `Quill`, `Document`, `RenderResult`, …) are not
// re-exported: import them straight from the `@quillmark/wasm` peer dependency,
// which is the single source of truth for the engine contract.
