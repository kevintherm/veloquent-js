/**
 * HTTP Adapter type definitions for Veloquent SDK
 * @module adapters/http/types
 */

/**
 * Options for an HTTP request
 * @typedef {Object} HttpRequest
 * @property {string} url - Endpoint URL (relative to baseUrl)
 * @property {'GET'|'POST'|'PATCH'|'DELETE'} method - HTTP method
 * @property {Record<string, string>} [headers] - Request headers
 * @property {Object|FormData|string} [body] - Request body (for POST/PATCH). Pass a plain object for JSON, or FormData for multipart file uploads.
 * @property {AbortSignal} [signal] - Cancellation signal
 * @property {number} [timeout] - Request timeout in milliseconds
 */

/**
 * HTTP response wrapper
 * @typedef {Object} HttpResponse
 * @property {number} status - HTTP status code
 * @property {string} statusText - HTTP status text
 * @property {Record<string, string>} headers - Response headers
 * @property {*} data - Parsed response body
 */

/**
 * HTTP adapter contract - implement this to provide custom HTTP clients
 * @interface HttpAdapter
 * @property {(req: HttpRequest) => Promise<HttpResponse>} request - Execute HTTP request
 * @property {(req: HttpRequest) => AsyncGenerator<Uint8Array>} [requestStream] - Execute HTTP request and stream response bytes
 */

export {}
