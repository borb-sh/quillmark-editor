#!/usr/bin/env node
/**
 * Quiver CLI — build, test, and preview a quiver collection.
 *
 * Commands:
 *   quiver build [--out <dir>]
 *   quiver test
 *   quiver preview [--out <dir>] [--format <fmt>] [--quiet]
 *                  [--include <ref>...] [--exclude <ref>...]
 *
 * Engine discovery (for `test` and `preview`):
 *   1. Named export `engine` from `quiver.config.js` at the collection root,
 *      if the file exists.
 *   2. Auto-imported `@quillmark/wasm` from the collection's node_modules.
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Quiver } from "../node.js";
import { renderQuiverSamples } from "../preview.js";
import type { Engine } from "@quillmark/wasm";

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const command = argv[0];

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function multiFlag(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === name) out.push(argv[i + 1]);
  }
  return out;
}

function hasFlag(name: string): boolean {
  return argv.includes(name);
}

// ---------------------------------------------------------------------------
// Engine discovery
// ---------------------------------------------------------------------------

async function loadEngine(cwd: string): Promise<Engine> {
  // Resolve @quillmark/wasm from the collection's node_modules (best-effort).
  // Its `Engine` renders every quill (cloning the core Quill/Document into the
  // backend itself). A quiver.config.js may export a custom `engine`.
  let wasm: { Engine: new () => Engine } | undefined;
  try {
    const req = createRequire(pathToFileURL(join(cwd, "package.json")).href);
    const wasmPath = req.resolve("@quillmark/wasm");
    wasm = (await import(pathToFileURL(wasmPath).href)) as {
      Engine: new () => Engine;
    };
  } catch {
    // Not installed — a quiver.config.js may still provide an engine.
  }

  // 1. Named `engine` export from quiver.config.js, if present.
  try {
    const cfg = await import(pathToFileURL(join(cwd, "quiver.config.js")).href);
    if (cfg.engine != null) {
      return cfg.engine as Engine;
    }
  } catch {
    // File absent or incomplete — fall through to auto-discovery.
  }

  // 2. Auto-discover from @quillmark/wasm.
  if (wasm == null) {
    throw new Error(
      "Cannot find @quillmark/wasm in this collection's node_modules.\n" +
        "  Install it:  npm install @quillmark/wasm\n" +
        "  Or export { engine } from quiver.config.js for a custom engine.",
    );
  }
  return new wasm.Engine();
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function build(): Promise<void> {
  const cwd = process.cwd();
  const outDir = flag("--out") ?? "dist";
  console.log(`quiver build: ${cwd} → ${outDir}`);
  await Quiver.build(cwd, outDir);
  console.log("done.");
}

async function test(): Promise<void> {
  const cwd = process.cwd();
  const engine = await loadEngine(cwd);
  const quiver = await Quiver.fromDir(cwd);

  const names = quiver.quillNames();
  if (names.length === 0) {
    console.error("error: quiver has no quills");
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;

  for (const name of names) {
    for (const version of quiver.versionsOf(name)) {
      const ref = `${name}@${version}`;
      try {
        const quill = await quiver.getQuill(ref);
        const doc = quill.seedDocument();
        let result: { artifacts?: unknown[] };
        try {
          result = await engine.render(quill, doc);
        } finally {
          doc.free();
        }
        if (!Array.isArray(result.artifacts) || result.artifacts.length === 0) {
          throw new Error("example render produced no artifacts");
        }
        console.log(`pass  ${ref}`);
        pass++;
      } catch (err) {
        console.error(`FAIL  ${ref} — ${(err as Error).message}`);
        fail++;
      }
    }
  }

  const total = pass + fail;
  console.log(`\n${pass}/${total} passed`);
  if (fail > 0) process.exit(1);
}

async function preview(): Promise<void> {
  const cwd = process.cwd();
  const engine = await loadEngine(cwd);
  const outDir = flag("--out");
  const format = flag("--format");
  const quiet = hasFlag("--quiet");
  const include = multiFlag("--include");
  const exclude = multiFlag("--exclude");
  await renderQuiverSamples(cwd, {
    engine,
    ...(outDir !== undefined && { outDir }),
    ...(format !== undefined && { format }),
    quiet,
    ...(include.length > 0 && { include }),
    ...(exclude.length > 0 && { exclude }),
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function usage(): void {
  console.error(
    [
      "Usage:",
      "  quiver build [--out <dir>]",
      "  quiver test",
      "  quiver preview [--out <dir>] [--format <fmt>] [--quiet]",
      "                 [--include <ref>...] [--exclude <ref>...]",
    ].join("\n"),
  );
}

function die(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`error: ${msg}`);
  process.exit(1);
}

switch (command) {
  case "build":
    build().catch(die);
    break;
  case "test":
    test().catch(die);
    break;
  case "preview":
    preview().catch(die);
    break;
  default:
    usage();
    process.exit(1);
}
