// `@quillmark/editor/bridge`: the shell wiring, bundled.
//
// One session, three surfaces, and the four hops between them (recompile, repaint,
// re-serialize, and each caret crossing). It reaches `/core` for types and NOTHING
// else: the handles are structural, so this couples no surface to another and a
// consumer with one surface passes one surface. The `/preview` reserved-package
// invariant is untouched — nothing here is imported by `/preview`.
export { connect } from './connect.js';
export type {
	ConnectOptions,
	Connection,
	EditorHandle,
	PreviewHandle,
	SourceHandle
} from './connect.js';
