// Packs the workspace's fixture quiver into `static/quiver/`, where the app fetches
// it at runtime. A browser cannot read the source layout, so the deploy-time pack is
// the step every browser consumer of a quiver performs; the playground performs it
// too rather than reaching for a shortcut only a bundler could take.
//
// `static/` is Kit's verbatim-copy tree, so one output serves both `vite dev` and the
// static build. The output is generated, and gitignored.

import { fileURLToPath } from 'node:url';
import { Quiver } from '@quillmark/quiver/node';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCE = fileURLToPath(new URL('../../../fixtures', import.meta.url));
const OUT = fileURLToPath(new URL('../static/quiver', import.meta.url));

await Quiver.build(SOURCE, OUT);
console.log(`quiver packed: ${SOURCE.replace(HERE, '')} → static/quiver`);
