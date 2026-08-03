---
'@quillmark/quiver': patch
---

The `file://` refusals from `Quiver.fromBuiltUrl` and `Quiver.fromManifest` name a factory that exists: `import { fromBuiltDir } from '@quillmark/quiver/node'`, not the `Quiver.fromBuiltDir` static removed when the Node factories became free functions.
