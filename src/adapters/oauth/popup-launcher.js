/**
 * Default popup-based OAuth launcher for browser
 * @module adapters/oauth/popup-launcher
 */

/**
 * Create an OAuth launcher that opens a popup window.
 * The popup closes itself after the redirect and postMessages the code back.
 *
 * @param {Object} [options]
 * @param {number} [options.width=500]
 * @param {number} [options.height=650]
 * @param {string} [options.trustedOrigin]
 * @returns {Function}
 */
export function createPopupOAuthLauncher(options = {}) {
  return (url) => new Promise((resolve, reject) => {
    const { width = 500, height = 650, trustedOrigin } = options
    const left = Math.round((globalThis.screen?.width - width) / 2) || 0
    const top  = Math.round((globalThis.screen?.height - height) / 2) || 0

    const popup = globalThis.window?.open(
      url,
      'veloquent_oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    )

    if (!popup) {
      return reject(new Error('Popup blocked. Allow popups for this site.'))
    }

    function cleanup() {
      clearInterval(closedTimer)
      globalThis.window?.removeEventListener('message', onMessage)
    }

    function onMessage(event) {
      if (trustedOrigin && event.origin !== trustedOrigin) return
      if (event.data?.veloquent_oauth_code) {
        cleanup()
        resolve(event.data.veloquent_oauth_code)
      }
    }

    const closedTimer = setInterval(() => {
      if (popup.closed) {
        cleanup()
        reject(new Error('OAuth popup was closed before completing.'))
      }
    }, 500)

    globalThis.window?.addEventListener('message', onMessage)
  })
}
