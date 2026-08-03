/**
 * Content addressing — browser-safe.
 *
 * `crypto.subtle` is the one digest primitive a browser and Node both expose,
 * and it exists only in a secure context: a page served over plain `http://`
 * to something other than localhost has no digest at all. Verification
 * degrades to a no-op there rather than failing every fetch, so `undefined`
 * means "cannot check", never "check failed". Node and any https page always
 * have one.
 */

/**
 * Digest width in the names `build` writes, in hex chars: 48 bits of SHA-256.
 * Wide enough that a manifest name colliding with a prior release's — which
 * would serve the old catalog forever under immutable CDN caching — is not a
 * birthday problem within any release count a quiver will see.
 */
export const NAME_DIGEST_LENGTH = 12;

/** SHA-256 over `bytes` as lowercase hex, or undefined where no digest exists. */
export async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle === undefined) return undefined;
	const digest = await subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
