// Packs the workspace's fixture quiver into `static/quiver/`, where the app fetches
// it at runtime. A browser cannot read the source layout, so this deploy-time pack is
// the step every browser consumer of a quiver performs (PLAYGROUND §"Where the quills
// come from").
//
// `static/` is Kit's verbatim-copy tree, so one output serves both `vite dev` and the
// static build. Generated, and gitignored.

import { fileURLToPath } from 'node:url';
import { Quiver } from '@quillmark/quiver/node';

const SOURCE = fileURLToPath(new URL('../../../fixtures', import.meta.url));
const OUT = fileURLToPath(new URL('../static/quiver', import.meta.url));

await Quiver.build(SOURCE, OUT);
console.log('quiver packed: fixtures/ → static/quiver');
