/**
 * SDK Error class for normalized error handling
 * @module errors/sdk-error
 */

/**
 * SdkError - Normalized error for SDK and API failures
 * @class
 * @extends Error
 */
export class SdkError extends Error {
  /**
   * @param {string} code - Error code (e.g., 'UNAUTHORIZED', 'VALIDATION_ERROR')
   * @param {string} message - Error message
   * @param {Object} [options]
   * @param {number} [options.statusCode] - HTTP status code
   * @param {*} [options.details] - Raw error response from API
   * @param {Error} [options.cause] - Original error
   */
  constructor(code, message, options = {}) {
    super(message)
    this.name = 'SdkError'
    this.code = code
    this.statusCode = options.statusCode
    this.details = options.details
    this.cause = options.cause

    // V8-specific: Better error stack traces
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Check if error is retryable
   * @returns {boolean}
   */
  isRetryable() {
    // Only retry on 5xx errors, not on 4xx client errors
    return this.statusCode && this.statusCode >= 500
  }

  /**
   * Serialize error for logging/debugging
   * @returns {Object}
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details
    }
  }
}
