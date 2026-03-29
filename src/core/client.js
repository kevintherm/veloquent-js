/**
 * Main SDK client
 * @module core/client
 */

import { validateConfig, DEFAULT_CONFIG } from './config.js'
import { RequestHelper } from './request.js'
import { Auth } from '../modules/auth.js'
import { Records } from '../modules/records.js'
import { Realtime } from '../modules/realtime.js'

/**
 * VeloPHP - Main SDK client
 * Access auth and records modules through this client
 * 
 * @class
 * @example
 * ```javascript
 * import { VeloPHP, createFetchAdapter, createLocalStorageAdapter } from '@velophp/sdk'
 * 
 * const sdk = new VeloPHP({
 *   apiUrl: 'https://example.com',
 *   http: createFetchAdapter(),
 *   storage: createLocalStorageAdapter()
 * })
 * 
 * const { token } = await sdk.auth.login('users', 'user@example.com', 'password')
 * const records = await sdk.records.list('users')
 * ```
 */
export class VeloPHP {
  /**
   * @param {Partial<import('./config.js').SdkConfig>} config
   */
  constructor(config) {
    this.config = validateConfig(config, DEFAULT_CONFIG)
    const requestHelper = new RequestHelper(this.config)
    this.auth = new Auth(requestHelper)
    this.records = new Records(requestHelper)
    this.realtime = new Realtime(requestHelper, this.config.realtime)
  }
}
