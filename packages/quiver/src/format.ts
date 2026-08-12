/**
 * The built artifact's format, stamped into `latest.json` and refused to be read past
 * (QUIVER §"The pointer" for why the pointer carries it and reads past keys it does not
 * know).
 *
 * It moves when a reader assuming it would misread a tree rather than fail on it: a
 * renamed pointer field, a second pointer, a store keyed by something other than the
 * full hash. A change confined to the manifest's own shape moves the manifest's
 * `version` instead.
 */
export const POINTER_FORMAT = 1;

/**
 * The manifest's own shape, stamped into the manifest and refused to be read past.
 *
 * The manifest is closed, so a field added to it is a field an older reader rejects as
 * unknown. This is what that reader reads first instead: the refusal names the version it
 * holds and the upgrade, where an unknown key names neither.
 *
 * Version 2 carries the quiver's `description`; version 1 is the same document without
 * it, and reads unchanged.
 */
export const MANIFEST_VERSION = 2;
