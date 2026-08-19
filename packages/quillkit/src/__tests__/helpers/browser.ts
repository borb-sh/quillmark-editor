/**
 * One page loaded in a real browser, over the debugging protocol it already speaks.
 *
 * Written rather than borrowed, for the same reason `serve.ts` is: what a load costs
 * here is a spawn, an endpoint read off stderr and two protocol calls, and a driver
 * library would be a dependency the whole gate carries for that. Node's own `WebSocket`
 * is the transport, and the browser is whatever the host already has.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** What a Playwright cache holds, by its own layout: a versioned directory per build. */
function cached(): string[] {
	const cache = process.env.PLAYWRIGHT_BROWSERS_PATH;
	if (cache === undefined || !existsSync(cache)) return [];
	// The containers here preset the cache and link the binary at its root.
	const paths = [join(cache, 'chromium')];
	for (const entry of readdirSync(cache))
		if (entry.startsWith('chromium-')) paths.push(join(cache, entry, 'chrome-linux', 'chrome'));
	return paths;
}

/**
 * Where a browser is, in the order a host is likely to have one: the override, a
 * Playwright cache, then the package managers' paths on Linux and macOS. GitHub's Ubuntu
 * runners ship Google Chrome, which is the one CI finds.
 */
function candidates(): string[] {
	return [
		process.env.QUILLKIT_CHROME,
		process.env.CHROME_PATH,
		...cached(),
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
		'/snap/bin/chromium',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/Applications/Chromium.app/Contents/MacOS/Chromium'
	].filter((path): path is string => path !== undefined);
}

/** The first candidate that is a binary, or a refusal naming the way out. */
export function chrome(): string {
	const tried = candidates();
	const at = tried.find((path) => existsSync(path) && statSync(path).isFile());
	if (at === undefined)
		throw new Error(
			`no browser found: install Chrome or Chromium, or set QUILLKIT_CHROME to one (tried ${tried.join(', ')})`
		);
	return at;
}

export interface Viewport {
	width: number;
	height: number;
}

/**
 * Load `url` at `viewport`, evaluate `expression` in the page and hand back what it
 * resolved to. The expression owns its own waiting: the load event fires before a
 * client has fetched anything of its own, so what a caller asks about is whatever the
 * page holds once its own promise settles.
 */
export async function load<T>(url: string, expression: string, viewport: Viewport): Promise<T> {
	const profile = await mkdtemp(join(tmpdir(), 'quillkit-chrome-'));
	const child = spawn(
		chrome(),
		[
			'--headless=new',
			// Containers run as root, where the sandbox refuses to start, and the page
			// loaded is one this process just laid on disk and served to itself.
			'--no-sandbox',
			'--disable-gpu',
			// A scrollbar is the host's width taken out of the viewport, which would leave
			// every relation below off by a platform's chrome.
			'--hide-scrollbars',
			`--window-size=${viewport.width},${viewport.height}`,
			`--user-data-dir=${profile}`,
			// The port the OS hands out, printed on stderr with the endpoint.
			'--remote-debugging-port=0',
			'about:blank'
			// Its own process group: a browser is a tree, and killing the parent alone leaves
			// children writing into the profile below.
		],
		{ detached: true }
	);

	try {
		const endpoint = await new Promise<string>((ok, no) => {
			let said = '';
			const timer = setTimeout(() => no(new Error(`browser printed no endpoint: ${said}`)), 30_000);
			child.stderr.on('data', (chunk: Buffer) => {
				said += chunk.toString();
				const match = /ws:\/\/\S+/.exec(said);
				if (match) {
					clearTimeout(timer);
					ok(match[0]);
				}
			});
			child.on('error', no);
		});

		const targets = (await (
			await fetch(new URL('/json/list', endpoint.replace('ws:', 'http:')))
		).json()) as { type: string; webSocketDebuggerUrl: string }[];
		const page = targets.find((t) => t.type === 'page');
		if (page === undefined) throw new Error('the browser opened no page');

		const socket = new WebSocket(page.webSocketDebuggerUrl);
		await new Promise((ok, no) => {
			socket.onopen = ok;
			socket.onerror = () => no(new Error(`cannot reach ${page.webSocketDebuggerUrl}`));
		});

		let last = 0;
		const answers = new Map<number, (result: Record<string, unknown>) => void>();
		const events = new Map<string, () => void>();
		socket.onmessage = (message: MessageEvent) => {
			const said = JSON.parse(String(message.data)) as {
				id?: number;
				method?: string;
				result?: Record<string, unknown>;
			};
			if (said.id !== undefined) answers.get(said.id)?.(said.result ?? {});
			else if (said.method !== undefined) events.get(said.method)?.();
		};
		const call = (method: string, params?: Record<string, unknown>) =>
			new Promise<Record<string, unknown>>((ok) => {
				const id = ++last;
				answers.set(id, (result) => {
					answers.delete(id);
					ok(result);
				});
				socket.send(JSON.stringify({ id, method, params }));
			});
		const fired = (method: string) => new Promise<void>((ok) => events.set(method, ok));

		await call('Page.enable');
		// Armed before the navigation, the event being the answer to it.
		const loaded = fired('Page.loadEventFired');
		await call('Page.navigate', { url });
		await loaded;

		const answer = (await call('Runtime.evaluate', {
			expression,
			awaitPromise: true,
			returnByValue: true
		})) as {
			result: { value: T };
			exceptionDetails?: { exception?: { description?: string } };
		};
		if (answer.exceptionDetails !== undefined)
			throw new Error(answer.exceptionDetails.exception?.description ?? 'the page threw');
		return answer.result.value;
	} finally {
		// The group, and then the wait: the profile is the browser's until the tree is
		// gone, and a removal racing the last flush finds a directory refilling under it.
		if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
		await new Promise((gone) => child.once('exit', gone));
		await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	}
}
