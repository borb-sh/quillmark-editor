// The body leaf's structural keymap — where the chains are composed, and the one
// place that fixes their precedence (VISUAL_EDITOR §Chrome).
//
// A body is a document, so its structural keys are STRUCTURAL; a surface nested in
// it that owns a key more locally joins the chain rather than rewriting the binding.
// Precedence is inner surface first: the `code_block` link (issue #84), then the
// list links (issue #70), and an island's cell traversal when #16 lands. Each link
// declines outside its surface, so the first link that claims the key gets it — and
// where none does, the key is not swallowed at all and leaves the body a keyboard
// exit.
//
// The composition lives HERE rather than in either surface: `lists.ts` must not
// import the code-block commands to know it comes second.
import type { Schema } from 'prosemirror-model';
import { chainCommands } from 'prosemirror-commands';
import type { Command } from 'prosemirror-state';
import { codeKeymap } from './code.js';
import { listKeymap } from './lists.js';

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

/** The block-schema body's structural keys — `{}` for the inline/plaintext schemas,
 * whose leaves declare neither lists nor code blocks. The argument list IS the
 * precedence order VISUAL_EDITOR §Chrome states, so a new link is one more argument
 * at its place in that order rather than a nesting to read inside out. */
export function bodyKeymap(schema: Schema): Record<string, Command> {
	return chainKeymaps(codeKeymap(schema), listKeymap(schema));
}
