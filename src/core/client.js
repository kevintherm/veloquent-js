/**
 * Main SDK client
 * @module core/client
 */

import { validateConfig, DEFAULT_CONFIG } from './config.js'
import { RequestHelper } from './request.js'
import { Auth } from '../modules/auth.js'
import { Records } from '../modules/records.js'
import { Realtime } from '../modules/realtime.js'
import { Collections } from '../modules/collections.js'
import { Schema } from '../modules/schema.js'
import { Onboarding } from '../modules/onboarding.js'
import { Ai } from '../modules/ai.js'

/**
 * Veloquent - Main SDK client
 * Access auth, records, collections, schema, onboarding, realtime and ai modules through this client
 * 
 * @class
 * @example
 * ```javascript
 * import { Veloquent, createFetchAdapter, createLocalStorageAdapter } from '@veloquent/sdk'
 * 
 * const sdk = new Veloquent({
 *   apiUrl: 'https://example.com',
 *   http: createFetchAdapter(),
 *   storage: createLocalStorageAdapter()
 * })
 * 
 * const { token } = await sdk.auth.login('users', 'user@example.com', 'password')
 * const records = await sdk.records.list('users')
 * ```
 */
export class Veloquent {
  /**
   * @param {Partial<import('./config.js').SdkConfig>} config
   */
  constructor(config) {
    this.config = validateConfig(config, DEFAULT_CONFIG)
    const requestHelper = new RequestHelper(this.config)
    this.auth = new Auth(requestHelper)
    this.records = new Records(requestHelper)
    this.collections = new Collections(requestHelper)
    this.schema = new Schema(requestHelper)
    this.onboarding = new Onboarding(requestHelper)
    this.realtime = new Realtime(requestHelper, this.config.realtime)
    this.ai = new Ai(requestHelper)
  }
}
