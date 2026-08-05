# @quillmark/studio

Look at what your quills are like to use: pick one, edit a real document through it, watch it paint, read the errors.

## Run it

```bash
cd my-quiver          # the directory holding Quiver.yaml
npx @quillmark/studio
```

Studio serves on `http://127.0.0.1:4321/` (`--port <n>` for another) and watches the quiver under the working directory: every save repacks it, and the document you are holding crosses into the new generation rather than being reseeded.

## What it answers

`quiver test` answers _does it work_ — every quill compiles, and it is what a build is blocked on. Studio answers _what is it like to use_, which is where most of what makes a quill good or bad lives: the schema drives the editor's controls, so a field typed as a string that should be a date renders a correct PDF through a poor authoring surface, and nothing that checks only for bytes can see it.

Nothing fails on studio's verdict. It is looked at, not blocked on.

## The wasm it renders through

Studio renders through the `@quillmark/wasm` installed beside your quiver — the same copy `quiver test` discovers — so the two cannot disagree about a quill. Install it if it is not there yet:

```bash
npm install @quillmark/wasm
```

A custom `engine` exported from `quiver.config.js` is a Node object and stays the gate's alone; studio's browser half resolves the package, not the config.

## What it is not

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-document management. Not a gate, and not a toolchain — it absorbs no verb from `quiver`.

## License

Apache-2.0
