// The playground is a client-side dev harness (a static SPA): the WASM boundary
// and the canvas paint loop are browser concerns, so there is nothing to render
// on the server. Disabling SSR keeps the harness simple and matches the static
// build the deployed playground ships.
export const ssr = false;
export const prerender = false;
