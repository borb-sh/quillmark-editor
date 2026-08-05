---
'@quillmark/studio': minor
---

First published version. `npx @quillmark/studio` in a quiver root packs the quiver under the working directory, serves the prebuilt client, and repacks on every save — the surface that answers _what is it like to use_, for an author who has `quiver build` and `quiver test` and no way to look. The Node half is a plain module rather than a Vite plugin, so the bin serves the client, the packed quiver and one event stream with no bundler behind it. The client's `@quillmark/wasm` imports are left bare and resolved in the browser against the copy installed beside the quiver, so studio and `quiver test` render through one artifact; the peer is optional because the bin discovers it rather than installing it, and a copy below the client's floor is refused at boot.
