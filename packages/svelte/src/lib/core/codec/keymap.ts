// The body leaf's structural keymap: where the chains are composed, and the one
// place that fixes their precedence (VISUAL_EDITOR §Chrome).
//
// A body is a document, so its structural keys are STRUCTURAL; a surface nested in
// it that owns a key more locally joins the chain rather than rewriting the binding.
// Precedence is inner surface first: the `code_block` link, then the
// list links. Each link declines outside its surface, so the first link that claims
// the key gets it; and where none does, the key is not swallowed at all and leaves
// the body a keyboard exit.
//
// A table island's cell traversal is NOT a link here: it binds on the NESTED cell
// view (`table-view.ts`), a keymap over a different document, so a key a cell
// handled never reaches this map at all.
//
// The composition lives HERE rather than in either surface: `lists.ts` must not
// import the code-block commands to know it comes second.
import type { Schema } from 'prosemirror-model';
import { chainCommands } from 'prosemirror-commands';
import type { Command } from 'prosemirror-state';
import { codeKeymap } from './code.js';
import { listKeymap } from './lists.js';
import { slashKeymap } from './slash.js';

/** One chain per key, the maps taken in precedence order: on a key several bind, an
 * earlier map's command runs first and the next runs only if it declines. A key one
 * map alone binds is its own. No input is mutated. */
function chainKeymaps(...maps: Record<string, Command>[]): Record<string, Command> {
	const out: Record<string, Command> = {};
	for (const map of maps) {
		for (const [key, cmd] of Object.entries(map)) {
			out[key] = out[key] ? chainCommands(out[key], cmd) : cmd;
		}
	}
	return out;
}

/** The block-schema body's structural keys: `{}` for the inline/plaintext schemas,
 * whose leaves declare neither lists nor code blocks. The argument list IS the
 * precedence order VISUAL_EDITOR §Chrome states, so a new link is one more argument
 * at its place in that order rather than a nesting to read inside out.
 *
 * The slash menu is innermost of the three, and it is conditional rather than
 * schema-gated: the keys exist only where a menu can be DRAWN (`slash`), because Enter
 * and Escape claimed by a surface nobody can see is a body that swallows two keys for
 * no visible reason. */
export function bodyKeymap(schema: Schema, slash?: boolean): Record<string, Command> {
	const links = slash ? [slashKeymap()] : [];
	return chainKeymaps(...links, codeKeymap(schema), listKeymap(schema));
}
