/**
 * Authentication module
 * Handles login, logout, and user retrieval scoped to auth collection
 * @module modules/auth
 */

/**
 * Auth module - handle user authentication
 * @class
 */
export class Auth {
  /**
   * @param {import('../core/request.js').RequestHelper} requestHelper
   */
  constructor(requestHelper) {
    this.requestHelper = requestHelper
  }

  /**
   * Login with email and password
   * Issues a stateful bearer token (opaque, 64-char hex string)
   * 
   * @param {string} collection - Auth collection name
   * @param {string} email
   * @param {string} password
   * @returns {Promise<Object>} { token, expires_in?, collection_name }
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * const { token } = await sdk.auth.login('users', 'user@example.com', 'password')
   * ```
   */
  async login(collection, identity, password) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: `/collections/${collection}/auth/login`,
      body: { identity, password }
    })

    // Extract token and store in storage
    const token = result.data.token
    const meta = {
      expires_in: result.data.expires_in,
      collection_name: result.data.collection_name,
      issued_at: new Date().toISOString()
    }

    await this.requestHelper.setToken(token, meta)

    return result.data
  }

  /**
   * Logout and revoke current token
   * 
   * @param {string} collection - Auth collection name
   * @returns {Promise<void>}
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * await sdk.auth.logout('users')
   * ```
   */
  async logout(collection) {
    try {
      await this.requestHelper.execute({
        method: 'DELETE',
        path: `/collections/${collection}/auth/logout`
      })
    } finally {
      // Clear token regardless of server response
      await this.requestHelper.clearToken()
    }
  }

  /**
   * Revoke all tokens for the authenticated user
   * Useful for security-sensitive operations (password change, etc.)
   * 
   * @param {string} collection - Auth collection name
   * @returns {Promise<void>}
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * await sdk.auth.logoutAll('users')
   * ```
   */
  async logoutAll(collection) {
    try {
      await this.requestHelper.execute({
        method: 'DELETE',
        path: `/collections/${collection}/auth/logout-all`
      })
    } finally {
      // Clear local token regardless of server response
      await this.requestHelper.clearToken()
    }
  }

  /**
   * Get the currently authenticated user record
   * If collection is provided, token must belong to that specific collection.
   * If collection is omitted, returns the user data and their collection info from /api/user.
   * 
   * @param {string} [collection] - Optional auth collection name
   * @returns {Promise<Object>} User record or profile data
   * @throws {SdkError}
   * 
   * @example
   * ```javascript
   * const user = await sdk.auth.me('users')
   * ```
   * 
   * @example
   * ```javascript
   * const profile = await sdk.auth.me() // calls /api/user
   * ```
   */
  async me(collection) {
    const path = collection 
      ? `/collections/${collection}/auth/me`
      : '/user'

    const result = await this.requestHelper.execute({
      method: 'GET',
      path
    })

    return result.data
  }

  /**
   * Check whether a token is currently stored
   * Does not validate token freshness or server-side revocation
   * 
   * @returns {boolean | Promise<boolean>}
   * 
   * @example
   * ```javascript
   * const authenticated = sdk.auth.isAuthenticated() // boolean for sync storage
   * ```
   * 
   * @example
   * ```javascript
   * const authenticated = await sdk.auth.isAuthenticated() // for async storage
   * ```
   */
  isAuthenticated() {
    const storage = this.requestHelper.config.storage

    if (storage.isAsync) {
      return this.requestHelper.getToken().then((token) => {
        return typeof token === 'string' && token.trim().length > 0
      })
    }

    const token = storage.getItem('vp:token')
    return typeof token === 'string' && token.trim().length > 0
  }
}
