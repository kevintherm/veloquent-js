/**
 * Authentication module
 * Handles login, logout, and user retrieval scoped to auth collection
 * @module modules/auth
 */

/**
 * @typedef {Object} SessionMeta
 * @property {number} [expires_in] - Seconds until token expires
 * @property {string} collection_name - Name of the auth collection
 * @property {string} issued_at - ISO timestamp
 */

/**
 * @typedef {Object} AuthResult
 * @property {string} token - Session token
 * @property {number} [expires_in] - Seconds until token expires
 * @property {string} collection_name - Name of the auth collection
 * @property {Record<string, any>} [record] - The user record
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
    this._user = null
    this._session = null
  }

  /**
   * Loads the authenticated state from storage.
   * Should be called during SDK initialization.
   * @returns {Promise<void>}
   */
  async loadState() {
    this._user = await this.requestHelper.getUser()
    this._session = await this.requestHelper.getAuthMeta()
  }

  /**
   * Get the currently authenticated user record
   * @type {Record<string, any> | null}
   */
  get user() {
    return this._user
  }

  /**
   * Get the current session metadata
   * @type {SessionMeta | null}
   */
  get session() {
    return this._session
  }


  /**
   * Login with identity and password
   * Issues a stateful bearer token (opaque, 64-char hex string)
   * 
   * @param {string} collection - Auth collection name
   * @param {string} identity - Value of the identity field (e.g. email or username)
   * @param {string} password
   * @returns {Promise<AuthResult>}
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
    this._session = meta

    if (result.data.record) {
      this._user = result.data.record
      await this.requestHelper.setUser(this._user)
    }

    return result.data
  }


  /**
   * Impersonate another auth record and store the returned token
   * @param {string} collection - Auth collection name
   * @param {string} recordId - Record ULID to impersonate
   * @returns {Promise<AuthResult>} Token payload
   * @throws {SdkError}
   */
  async impersonate(collection, recordId) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: `/collections/${collection}/auth/impersonate/${recordId}`
    })

    const token = result.data.token
    const meta = {
      expires_in: result.data.expires_in,
      collection_name: result.data.collection_name,
      issued_at: new Date().toISOString()
    }

    await this.requestHelper.setToken(token, meta)
    this._session = meta

    if (result.data.record) {
      this._user = result.data.record
      await this.requestHelper.setUser(this._user)
    }

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
      this._user = null
      this._session = null
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
      this._user = null
      this._session = null
    }
  }


  /**
   * Get the currently authenticated user record
   * If collection is provided, token must belong to that specific collection.
   * If collection is omitted, returns the user data and their collection info from /api/user.
   * 
   * @param {string} [collection] - Optional auth collection name
   * @returns {Promise<Record<string, any>>} User record or profile data
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

    this._user = result.data
    await this.requestHelper.setUser(this._user)

    return result.data
  }


  /**
   * Get the OAuth provider redirect URL for the given collection.
   * Open this URL in a browser/webview. After authorization, the server
   * redirects back with a `?code=` exchange code — pass it to `exchangeOAuthCode()`.
   *
   * @param {string} collection - Auth collection name or ID
   * @param {string} provider - 'google' | 'github' | 'facebook' | 'x'
   * @returns {Promise<string>} The redirect URL to open
   */
  async getOAuthRedirectUrl(collection, provider) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: '/oauth2/redirect',
      body: { collection, provider }
    })

    return result.data.redirect_url
  }

  /**
   * Exchange an OAuth exchange code for a session token.
   * Extract the `code` param from your deep link / redirect URI and call this.
   * Token and user record are stored automatically.
   *
   * @param {string} code - The exchange code from the OAuth callback URL
   * @returns {Promise<AuthResult>}
   */
  async exchangeOAuthCode(code) {
    const result = await this.requestHelper.execute({
      method: 'POST',
      path: '/oauth2/exchange',
      body: { code }
    })

    return this._doExchange(result.data)
  }

  /**
   * Full OAuth login flow.
   * Gets the redirect URL, delegates browser/launch handling to the provided launcher,
   * then exchanges the code for a session token.
   *
   * @param {string} collection - Auth collection name or ID
   * @param {string} provider - 'google' | 'github' | 'facebook' | 'x'
   * @param {Function} launcher - Platform adapter that opens the URL and resolves with the exchange code
   * @returns {Promise<AuthResult>} The session data
   */
  async loginWithOAuth(collection, provider, launcher) {
    const url = await this.getOAuthRedirectUrl(collection, provider)
    const code = await launcher(url)
    return this.exchangeOAuthCode(code)
  }

  /**
   * Shared token storage logic for OAuth flows
   * @private
   * @param {Record<string, any>} data
   * @returns {Promise<AuthResult>}
   */
  async _doExchange(data) {
    const token = data.token
    const meta = {
      expires_in: data.expires_in,
      collection_name: data.collection_name,
      issued_at: new Date().toISOString()
    }

    await this.requestHelper.setToken(token, meta)
    this._session = meta

    if (data.record) {
      this._user = data.record
      await this.requestHelper.setUser(this._user)
    }

    return data
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
