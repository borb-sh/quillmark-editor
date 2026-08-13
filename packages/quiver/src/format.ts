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
 * The manifest's shape, stated in the document and refused to be read past. Version 2
 * carries the quiver's `description`; version 1 is the same document without it.
 *
 * The manifest is closed, so a field added to it is a field an older reader rejects as an
 * unknown key, naming neither what happened nor what to do. The version is what that
 * reader reads first instead, and a manifest above its own is refused with the upgrade
 * named.
 */
export const MANIFEST_VERSION = 2;
