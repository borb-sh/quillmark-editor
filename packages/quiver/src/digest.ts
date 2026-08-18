/**
 * Content addressing. Browser-safe.
 *
 * `crypto.subtle` is the one digest primitive a browser and Node both expose,
 * and it exists only in a secure context: a page served over plain `http://`
 * to something other than localhost has no digest at all. Verification
 * degrades to a no-op there rather than failing every fetch, so `undefined`
 * means "cannot check", never "check failed". Node and any https page always
 * have one.
 */

/**
 * Digest width in the names `build` writes, in hex chars: 128 bits of SHA-256.
 *
 * The width answers a chosen prefix, not a collision. Where the manifest is trusted
 * and the bundles are not — the seeded deployment, where the two come from different
 * places by design — this is the only thing between a served zip and the quill it
 * claims to be, and a quill is a template the backend executes. Grinding padding
 * until SHA-256 lands on a chosen 48-bit prefix is hours of one GPU.
 */
export const NAME_DIGEST_LENGTH = 32;

/** SHA-256 over `bytes` as lowercase hex, or undefined where no digest exists. */
export async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
	const subtle = globalThis.crypto?.subtle;
	if (subtle === undefined) return undefined;
	const digest = await subtle.digest('SHA-256', bytes as BufferSource);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
