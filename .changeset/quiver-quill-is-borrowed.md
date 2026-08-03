---
'@quillmark/quiver': patch
---

`getQuill`'s returned quill is documented as **borrowed**: it is cached per canonical ref and handed to every caller for the quiver's lifetime, so `free()`ing it leaves the next caller holding a freed handle. Code that wants a quill of its own mints it from `(await quiver.getQuill(ref)).toTree()`.
