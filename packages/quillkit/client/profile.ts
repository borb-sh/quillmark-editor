// The author's own boilerplate, kept between documents: the fields a writer restates on
// every new document of a given quill — a letterhead, a signature block — stored verbatim
// and laid onto the next seed.
//
// Studio otherwise stores nothing (STUDIO §"The document is the blueprint's"), and this is
// the one exception, drawn narrowly. It holds no document: a profile is a set of field
// values the author nominated, and a seeded document is where they land. What a repack
// carries is unchanged, because a carry already has the values the author typed.
//
// The store is per quill NAME rather than per canonical ref: a letterhead outlives the
// version that printed it, so a quill stepping 0.3.0 → 0.4.0 keeps the profile. A field
// the new schema no longer declares is dropped at the write it fails, one field at a time
// ({@link applyProfile}), so a stale entry costs the entry rather than the profile.
//
// Every reach into `localStorage` is guarded: a browser in private mode, a storage quota,
// and a page whose site data is blocked all throw on access rather than answering empty,
// and none of them is a reason for studio not to open.

/** Values by field name, exactly as `getStored` handed them over. */
export type Profile = Record<string, unknown>;

/** One store entry per quill name. */
const KEY = 'quillkit:studio:profile:';

/** The store, or `undefined` where the browser has none to give. Reading the property can
 *  itself throw, which is why this is a call rather than a module-level binding. */
function store(): Storage | undefined {
	try {
		return globalThis.localStorage ?? undefined;
	} catch {
		return undefined;
	}
}

/**
 * The profile saved for `quill`, or `undefined` where there is none — a browser with no
 * storage, an entry never written, and an entry that no longer parses all answer the same
 * way, since each leaves a seed with nothing to lay on it.
 */
export function loadProfile(quill: string): Profile | undefined {
	const held = store();
	if (!held) return undefined;
	let raw: string | null;
	try {
		raw = held.getItem(KEY + quill);
	} catch {
		return undefined;
	}
	if (raw === null) return undefined;
	try {
		const parsed: unknown = JSON.parse(raw);
		// An array and a null both parse; neither is a field map, and treating one as
		// empty is what keeps a hand-edited entry from reaching `storeField`.
		return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
			? (parsed as Profile)
			: undefined;
	} catch {
		return undefined;
	}
}

/**
 * Save `values` as the profile for `quill`, replacing what was there. An empty map clears
 * the entry rather than writing one, so "remember nothing" and "no profile" are one state.
 *
 * Answers whether the store took it: a quota or a blocked store is a refusal the caller
 * says out loud, since a save that silently did nothing is a letterhead the author
 * believes is kept.
 */
export function saveProfile(quill: string, values: Profile): boolean {
	const held = store();
	if (!held) return false;
	try {
		if (Object.keys(values).length === 0) held.removeItem(KEY + quill);
		else held.setItem(KEY + quill, JSON.stringify(values));
		return true;
	} catch {
		return false;
	}
}

/** Drop the profile for `quill`. Answers whether the store took it. */
export function clearProfile(quill: string): boolean {
	return saveProfile(quill, {});
}

/**
 * Lay `profile` onto `doc`, field by field, and answer the names that landed.
 *
 * One write per field rather than the atomic `storeFields`, because the failure this has
 * to survive is a schema that moved: a field the quill no longer declares would abort a
 * batch and take the whole letterhead with it, where one write at a time costs that field
 * alone. The verbatim store lane is what is used on both sides — the values were read with
 * `getStored` — so nothing here interprets a value or needs the quill to.
 */
export function applyProfile(
	doc: { storeField(addr: string, value: unknown): void },
	profile: Profile
): string[] {
	const landed: string[] = [];
	for (const [field, value] of Object.entries(profile)) {
		if (value === undefined) continue;
		try {
			doc.storeField(field, value);
			landed.push(field);
		} catch {
			// The schema will not take it: the profile outlived the field. Dropped here
			// rather than pruned from the store, so a field that comes back — a version
			// picked back down, a quill mid-edit — is laid again on the next seed.
		}
	}
	return landed;
}
