// The one address vocabulary the surfaces speak in public: canonical `DocPath`
// strings for places, `Addr` for the document verbs. Declared HERE because both
// `/preview` and `/visual` name a place in their hooks, and a type declared twice
// structurally is drift with nothing to catch it: `/core` is the module both
// already import.
//
// Slogan: paths for places, indexes for structure ops. `Addr` (`{card?, field?}`)
// is the mutator currency, exported beside this; `fieldPathForAddr` converts.

/**
 * A canonical field address: `main.<field>` / `main.body` /
 * `cards.<kind>[<i>].<field>`, cards keyed by ABSOLUTE document index.
 *
 * The grammar `parseDocPath` / `formatDocPath` speak, and the one
 * `Diagnostic.path`, `ContentHit.field`, `FieldRegion.field` and
 * `session.regions()` keys already use. An alias over `string`: the boundary
 * exports the parser and the segment type, not a nominal type, so this names the
 * grammar at a signature rather than inventing a checked one.
 */
export type DocPath = string;

/**
 * A place in the document: a field and a caret within it. What the editor reports
 * when its caret moves and what the preview scrolls to, so the editor→preview hop
 * is `onCaretMove={preview.focusPosition}` and translates nothing.
 *
 * `pos` is USV, the shared content coordinate on both sides of the boundary: a
 * `ContentHit` is a `Place` with its own extras, and fits wherever one is taken.
 */
export interface Place {
	field: DocPath;
	/** The caret in USV. */
	pos: number;
}
