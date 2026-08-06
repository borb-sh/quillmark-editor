// The author-side gate, as an author writes it: the whole of what a published quiver
// needs beside its quills, and the workspace's own reference quiver runs it.
//
// Run with `node --test` from this directory. The suite spawns it
// (`packages/quiver/src/__tests__/cli.integration.test.ts`), so the `/testing` door
// and the CLI's are both proven against the same quill.
import { Engine } from '@quillmark/wasm';
import { runQuiverTests } from '@quillmark/quiver/testing';

runQuiverTests(import.meta.url, new Engine());
