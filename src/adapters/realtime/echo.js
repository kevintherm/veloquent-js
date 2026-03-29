/**
 * Echo realtime adapter
 * @module adapters/realtime/echo
 */

/**
 * Creates a realtime adapter using a Laravel Echo instance
 * 
 * @param {Object} echoInstance - An instantiated Laravel Echo object
 * @returns {Object} Realtime adapter
 * 
 * @example
 * ```javascript
 * import Echo from 'laravel-echo'
 * import Pusher from 'pusher-js'
 * 
 * window.Pusher = Pusher
 * const echo = new Echo({ ... })
 * 
 * const adapter = createEchoAdapter(echo)
 * ```
 */
export function createEchoAdapter(echoInstance) {
  if (!echoInstance) {
    throw new Error('SDK: Echo instance is required for createEchoAdapter')
  }

  return {
    /**
     * Subscribe to a private channel
     * @param {string} channel
     * @returns {Object} Channel instance with listen() method
     */
    private(channel) {
      return echoInstance.private(channel)
    },

    /**
     * Leave a channel
     * @param {string} channel
     */
    leave(channel) {
      echoInstance.leave(channel)
    },

    /**
     * Disconnect the underlying realtime connection
     */
    disconnect() {
      if (typeof echoInstance.disconnect === 'function') {
        echoInstance.disconnect()
      }
    }
  }
}
