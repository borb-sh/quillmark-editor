/**
 * The built artifact's format, as the pointer states it.
 *
 * `latest.json` is the one name a client fetches knowing nothing else about the tree,
 * so it is where a format change announces itself. That works only if a reader
 * tolerates fields it does not know — a pointer parsed strictly can never be told
 * anything new — which is why the pointer is the one document here whose unknown keys
 * pass through, and the manifest behind it stays closed.
 *
 * The number a writer stamps and a reader refuses to read past. It moves when a
 * reader assuming it would MISREAD a tree rather than fail on it: a renamed pointer
 * field, a second pointer, a store that is no longer keyed by full hash. A change
 * confined to the manifest's own shape moves the manifest's `version` instead.
 *
 * Skew is the ordinary case rather than the broken one: an author's collection is
 * packed by whatever `@quillmark/quiver` their CI installs, and read by the copy
 * frozen inside whichever client is laid over it.
 */
export const POINTER_FORMAT = 1;
