/**
 * The built artifact's format, stamped into `latest.json` and refused to be read past
 * (QUIVER §"The pointer" for why the pointer carries it and reads past keys it does not
 * know).
 *
 * It moves when a reader assuming it would MISREAD a tree rather than fail on it: a
 * renamed pointer field, a second pointer, a store keyed by something other than the
 * full hash. A change confined to the manifest's own shape moves the manifest's
 * `version` instead.
 */
export const POINTER_FORMAT = 1;
