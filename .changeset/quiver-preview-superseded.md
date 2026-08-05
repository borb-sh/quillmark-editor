---
'@quillmark/quiver': minor
---

The `/preview` subpath is removed, along with `renderQuiverSamples`, its HTML gallery and the CLI's `preview` verb. `build` and `test` are now the whole of what this package gives a quill author.

It answered "let me look at it" with one seeded example per quill, rendered once to a file beside a hand-written gallery. Studio answers the same question live, with a document the author controls and a schema they can feel, so a file writer and an HTML gallery inside a loader package have nothing left to survive on.

The flat "this package never renders" claim narrows to the loaders: `/testing` still compiles and renders every quill, because proving a quill renders is what a gate for quills is.
