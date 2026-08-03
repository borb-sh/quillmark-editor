---
'@quillmark/svelte': minor
---

An island edit commits as ops rather than an install. A table's cells and an image's url live in the island entry, not in the content text, so an edit to one produced no delta and no ops at all and never reached the store. It now lowers through the `islandOps` channel: a changed payload is `set`, a slot the text splice may not carry is `insert`, and a deleted island rides the delta that drops its slot. Every identity anchor in the field survives an island edit, and an island's `loss` class is carried by the projection instead of restamped `lossless` on every write.
