# Spike: cutting the tool out of the library

A throwaway branch's lab bench, not canon: the numbers behind splitting `@quillmark/quiver` into a library apps pin and a tool authors run. Nothing here ships, and the branch dies with the decision.

`node spike/package-cut/measure.mjs`, from the workspace root. Sections 1 and 2 read `dist/`, so build first: `npm run build -w packages/quiver`, and `npx vite build` in `packages/studio`.

## What it measures

**1. Compiled bytes, by partition.** 55.9 KB total: 22.7 KB writer plus bin (41%), 3.5 KB shared leaves (6%), 29.7 KB reader (53%). A browser bundle reaches none of the writer, since `index.ts` never reaches `node.ts` and the writer's `node:*` imports are dynamic. The writer living in a production package costs dead bytes on disk and a linked bin, and nothing at runtime.

**2. The dev client, by asset.** 35.8 MB, of which 35.0 MB is three wasm backends (1.7 + 6.6 + 26.7 MB) and 756 KB is everything else. The backends are code-split, so a browser fetches one; a tarball carries three. A tool that carries the client puts all of it in every CI install of every collection, beside the author's own copy of the artifact, which is the copy the gate renders through.

**3. The format seam.** Five symbols `build.ts` reaches are package-internal and no entry publishes them: `scanSourceQuiver` and `readQuillTree` (the source scan), `packFiles`, `NAME_DIGEST_LENGTH`, `POINTER_FORMAT`. Moving the writer out means publishing them, duplicating them, or leaving it where it is. `POINTER_FORMAT` is the one constant that must never drift, which rules out duplication.

The construction door is the harder half: `source-loader.ts` builds through `createQuiver`, which `quiver.ts` exports and no `exports` entry reaches, by design. `fromDir` cannot follow the writer out without opening it.

**4. Client resolution.** `"exports": {}` blocks every specifier including `<pkg>/package.json`, with `ERR_PACKAGE_PATH_NOT_EXPORTED`. One entry, `"./package.json": "./package.json"`, makes the client findable while keeping it non-importable, so the bundled-terminal rule holds: nothing imports it, and the copy it bundles meets no other. A tool resolves its client the way studio already resolves the author's packer.

Node caches a directory's `package.json` for the life of the process, so the script writes one package per case rather than rewriting one; a rewrite measures the first parse twice and reports both cases alike.

## What the numbers decide

The bin is the audit surface a production tree should not carry; `build` is a library function an app can call at deploy time. Cutting at the bin costs no new public surface and leaves the sealed constructor sealed. Cutting at `build` buys 22.7 KB of disk and costs a published format contract between two packages versioned apart.

A client the tool resolves rather than carries keeps a gate install at 91 KB against 35.8 MB, and section 4 is the whole mechanism.
