---
'@quillmark/quiver': minor
---

`Quiver#resolve` is sync: `quiver.resolve(ref)` returns the canonical ref rather than a promise for one. Resolution reads the in-memory catalog every loader materializes when the quiver is built, and `QuiverLoader` carries one verb, `loadTree`, which it never reaches — so the promise priced I/O the design does not admit, and `quillNames()` / `versionsOf()` were already sync. Drop the `await`; a caller catching `invalid_ref` or `quill_not_found` catches a throw instead of a rejection. `getQuill` is unchanged.
