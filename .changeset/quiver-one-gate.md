---
'@quillmark/quiver': minor
---

The `/testing` subpath is removed, along with `runQuiverTests`. `quiver test` is the one way to gate a quiver.

The two ran the same loop, and only one reaches the floor an author should get: npm links the `bin` onto PATH, so a gated quiver is `Quiver.yaml`, `quills/`, and `"test": "quiver test"`, with no file to write and no engine to pass. A library harness cannot match that — npm has no way for a dependency to supply a default `npm test`, and `node --test` skips `node_modules` when discovering files, so the author writes the wrapper either way.

An author who wants the gate inside an existing test runner writes the loop instead: `fromDir`, `getQuill`, `seedDocument` and `engine.render` are public, and `await init()` from `@quillmark/wasm` comes first.
