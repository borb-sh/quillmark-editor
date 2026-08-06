---
'@quillmark/quiver': patch
---

The author-side gate instantiates the core before it renders. Every `@quillmark/wasm` export throws `runtime::not_initialized` until `init()` resolves and `new Engine()` is lazy, so both `quiver test` and `runQuiverTests` reported an uninitialized runtime as a failing quill and gated nothing. Neither door's signature moves: the harness awaits `init()` itself, so a caller still passes `new Engine()` at module scope.
