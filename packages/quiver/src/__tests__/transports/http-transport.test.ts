import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HttpTransport } from '../../transports/http-transport.js';
import { QuiverError } from '../../errors.js';

// ─── Mock fetch helpers ───────────────────────────────────────────────────────

type FetchMock = (url: string) => Promise<Response>;

function makeFetchMock(fn: FetchMock): typeof globalThis.fetch {
	return fn as typeof globalThis.fetch;
}

function mockOkResponse(bytes: Uint8Array): Response {
	return new Response(bytes.buffer as ArrayBuffer, { status: 200 });
}

function mockErrorResponse(status: number): Response {
	return new Response(null, { status });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HttpTransport.fetchBytes', () => {
	let originalFetch: typeof globalThis.fetch | undefined;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		if (originalFetch !== undefined) {
			globalThis.fetch = originalFetch;
		} else {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			delete (globalThis as any).fetch;
		}
	});

	it('happy path: returns bytes from a 200 response', async () => {
		const expected = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
		const capturedUrls: string[] = [];

		globalThis.fetch = makeFetchMock(async (url: string) => {
			capturedUrls.push(url);
			return mockOkResponse(expected);
		});

		const transport = new HttpTransport('https://cdn.example.com/quivers/my/');
		const bytes = await transport.fetchBytes('latest.json');

		expect(bytes).toEqual(expected);
		expect(capturedUrls).toEqual(['https://cdn.example.com/quivers/my/latest.json']);
	});

	it('HTTP 404 throws transport_error', async () => {
		globalThis.fetch = makeFetchMock(async () => mockErrorResponse(404));

		const transport = new HttpTransport('https://cdn.example.com/quivers/');
		await expect(transport.fetchBytes('missing.json')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});

	it('network error (fetch rejects) throws transport_error with cause', async () => {
		globalThis.fetch = makeFetchMock(async () => {
			throw new TypeError('Network failure');
		});

		const transport = new HttpTransport('https://cdn.example.com/quivers/');
		let thrown: unknown;
		try {
			await transport.fetchBytes('latest.json');
		} catch (e) {
			thrown = e;
		}

		expect(thrown).toBeInstanceOf(QuiverError);
		expect((thrown as QuiverError).code).toBe('transport_error');
		expect((thrown as QuiverError).cause).toBeInstanceOf(TypeError);
	});

	describe('URL joining', () => {
		it('base URL with trailing slash + normal relative path', async () => {
			const capturedUrls: string[] = [];
			globalThis.fetch = makeFetchMock(async (url: string) => {
				capturedUrls.push(url);
				return mockOkResponse(new Uint8Array([1]));
			});

			const transport = new HttpTransport('https://cdn.example.com/base/');
			await transport.fetchBytes('store/abc');
			expect(capturedUrls[0]).toBe('https://cdn.example.com/base/store/abc');
		});

		it('base URL without trailing slash — adds one', async () => {
			const capturedUrls: string[] = [];
			globalThis.fetch = makeFetchMock(async (url: string) => {
				capturedUrls.push(url);
				return mockOkResponse(new Uint8Array([1]));
			});

			const transport = new HttpTransport('https://cdn.example.com/base');
			await transport.fetchBytes('store/abc');
			expect(capturedUrls[0]).toBe('https://cdn.example.com/base/store/abc');
		});

		it('relative path with leading slash — strips the leading slash', async () => {
			const capturedUrls: string[] = [];
			globalThis.fetch = makeFetchMock(async (url: string) => {
				capturedUrls.push(url);
				return mockOkResponse(new Uint8Array([1]));
			});

			const transport = new HttpTransport('https://cdn.example.com/base/');
			await transport.fetchBytes('/store/abc');
			expect(capturedUrls[0]).toBe('https://cdn.example.com/base/store/abc');
		});
	});
});

describe('HttpTransport — revalidation', () => {
	// `latest.json` is the one name in the artifact that is not
	// content-addressed, so it is the one request a browser cache may not answer
	// on its own. Everything else is immutable by construction.
	let originalFetch: typeof globalThis.fetch | undefined;

	beforeEach(() => {
		originalFetch = globalThis.fetch;
	});

	afterEach(() => {
		if (originalFetch !== undefined) globalThis.fetch = originalFetch;
	});

	async function initFor(opts?: { revalidate?: boolean }): Promise<RequestInit | undefined> {
		let captured: RequestInit | undefined;
		globalThis.fetch = (async (_url: string, init?: RequestInit) => {
			captured = init;
			return new Response(new Uint8Array([1]).buffer as ArrayBuffer, { status: 200 });
		}) as typeof globalThis.fetch;

		const transport = new HttpTransport('https://cdn.example.com/q/');
		await transport.fetchBytes('latest.json', opts);
		return captured;
	}

	it('asks the cache to revalidate when told to', async () => {
		expect(await initFor({ revalidate: true })).toEqual({ cache: 'no-cache' });
	});

	it('leaves caching to the browser otherwise', async () => {
		expect(await initFor()).toBeUndefined();
		expect(await initFor({ revalidate: false })).toBeUndefined();
	});
});
