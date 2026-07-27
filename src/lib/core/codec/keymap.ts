// The body leaf's structural keymap — where the chains are composed, and the one
// place that fixes their precedence (VISUAL_EDITOR §Chrome).
//
// A body is a document, so its structural keys are STRUCTURAL; a surface nested in
// it that owns a key more locally prepends a link rather than rewriting the
// binding. Precedence is inner surface first: the `code_block` link (issue #84),
// then the list links (issue #70), and an island's cell traversal when #16 lands.
// Each link declines outside its surface, so the outermost link that claims the key
// gets it — and where none does, the key is not swallowed at all and leaves the
// body a keyboard exit.
//
// The composition lives HERE rather than in either surface: `lists.ts` must not
// import the code-block commands to know it comes second.
import type { Schema } from 'prosemirror-model';
import { chainCommands } from 'prosemirror-commands';
import type { Command } from 'prosemirror-state';
import { codeKeymap } from './code.js';
import { listKeymap } from './lists.js';

/** `link` before `base` on every key the two share; a key only `link` binds is its
 * own. Neither input is mutated. */
function prepend(
	base: Record<string, Command>,
	link: Record<string, Command>
): Record<string, Command> {
	const out = { ...base };
	for (const [key, cmd] of Object.entries(link)) {
		out[key] = out[key] ? chainCommands(cmd, out[key]) : cmd;
	}
	return out;
}

/** The block-schema body's structural keys — `{}` for the inline/plaintext schemas,
 * whose leaves declare neither lists nor code blocks. */
export function bodyKeymap(schema: Schema): Record<string, Command> {
	return prepend(listKeymap(schema), codeKeymap(schema));
}
