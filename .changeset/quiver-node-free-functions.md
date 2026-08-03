---
'@quillmark/quiver': minor
---

The Node factories become free functions: `import { fromDir, fromPackage, fromBuiltDir, build, buildPackage } from '@quillmark/quiver/node'`, replacing the statics `/node` installed on the shared `Quiver` class. The class is browser-pure, the package has no side effects, and `Quiver._fromLoader` is gone from the public surface. `Quiver.fromBuiltUrl` and `Quiver.fromManifest` are unchanged.

`fromPackage` and `buildPackage` take a `from` argument — pass `import.meta.url`. Without it resolution runs from this package's own install location, so a consumer's quiver was unreachable under an isolated `node_modules` layout.

`build` refuses an output directory that is, or contains, the source quiver or the working directory, rather than clearing it.

Build output moves from MD5 to SHA-256 — 12 hex chars in bundle and manifest names, full width for font store keys — and the loader now verifies fetched bytes against the digest in their name, raising `transport_error` on a mismatch. `latest.json` is fetched `no-cache`. Artifacts built by an earlier version must be rebuilt.

`BuildOptions` is removed; it reserved nothing an optional trailing parameter cannot add back.
