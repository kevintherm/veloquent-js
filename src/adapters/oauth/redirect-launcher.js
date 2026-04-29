/**
 * Default full-page redirect OAuth launcher
 * @module adapters/oauth/redirect-launcher
 */

/**
 * Create an OAuth launcher that does a full-page redirect.
 * After the OAuth callback, your page reloads with `?code=` in the URL.
 * Read the code and call `sdk.auth.exchangeOAuthCode(code)` manually on load.
 *
 * @returns {Function}
 */
export function createRedirectOAuthLauncher() {
  return (url) => new Promise(() => {
    if (globalThis.window) {
      globalThis.window.location.href = url // intentionally never resolves
    }
  })
}
