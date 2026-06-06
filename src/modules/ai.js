/**
 * AI module for agent chat operations
 * @module modules/ai
 */

/**
 * Detect if a value contains a File, Blob, or FileList that requires multipart upload.
 * Guards against browser-only globals so this module also works in Bun/Node environments.
 * @param {*} value
 * @returns {boolean}
 */
function isFileValue(value) {
  if (typeof File !== 'undefined' && value instanceof File) return true
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof FileList !== 'undefined' && value instanceof FileList) return true
  if (Array.isArray(value)) return value.some(isFileValue)
  return false
}

/**
 * Build a FormData from a data object if it contains any File/Blob values.
 * Returns null if no files are detected (use JSON body instead).
 * @param {Object} data
 * @returns {FormData|null}
 */
function buildFormData(data) {
  const hasFiles = Object.values(data).some(isFileValue)
  if (!hasFiles) return null

  const form = new FormData()

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if ((typeof File !== 'undefined' && item instanceof File) ||
            (typeof Blob !== 'undefined' && item instanceof Blob)) {
          form.append(key, item, item instanceof File ? item.name : undefined)
        } else {
          form.append(key, typeof item === 'object' ? JSON.stringify(item) : String(item))
        }
      }
      continue
    }

    if (typeof FileList !== 'undefined' && value instanceof FileList) {
      for (const file of value) {
        form.append(key, file, file.name)
      }
      continue
    }

    if ((typeof File !== 'undefined' && value instanceof File) ||
        (typeof Blob !== 'undefined' && value instanceof Blob)) {
      form.append(key, value, value instanceof File ? value.name : undefined)
      continue
    }

    if (typeof value === 'object') {
      form.append(key, JSON.stringify(value))
      continue
    }

    form.append(key, String(value))
  }

  return form
}

/**
 * AI Module - interface with AI agent chat endpoint
 * @class
 */
export class Ai {
  /**
   * @param {import('../core/request.js').RequestHelper} requestHelper
   */
  constructor(requestHelper) {
    this.requestHelper = requestHelper
  }

  /**
   * Send a chat prompt to an AI agent
   * 
   * @param {Object} options
   * @param {string} options.agent - Agent ULID or unique name
   * @param {string} options.prompt - Prompt content
   * @param {string} [options.collection='agents'] - Collection where the agent is stored
   * @param {Array<{role: string, content: string}>} [options.messages] - Past messages history
   * @param {Array<File|Blob>} [options.attachments] - Files to attach/upload
   * @param {string} [options.outputType] - Override output format ('text' or 'json')
   * @param {Object} [options.schema] - JSON Schema for structured output
   * @param {boolean} [options.stream=false] - Stream response chunks if true
   * @param {AbortSignal} [options.signal] - Cancellation signal
   * @returns {Promise<Object>|AsyncGenerator<Object>} Response object, or generator if stream: true
   * @throws {Error|SdkError}
   */
  chat(options = {}) {
    const {
      outputType,
      schema,
      stream = false
    } = options

    if (stream) {
      if (outputType === 'json' || schema) {
        throw new Error('Streaming is not supported for structured output.')
      }
      return this.chatStream(options)
    }

    return this._chatImpl(options)
  }

  async _chatImpl(options = {}) {
    const {
      agent,
      prompt,
      collection = 'agents',
      messages,
      attachments,
      outputType,
      schema,
      signal
    } = options

    const body = { agent, prompt }

    if (messages) body.messages = messages
    if (attachments) body.attachments = attachments
    if (outputType) body.output_type = outputType
    if (schema) body.schema = schema

    const formData = buildFormData(body)

    const result = await this.requestHelper.execute({
      method: 'POST',
      path: `/collections/${collection}/ai/chat`,
      body: formData ?? body,
      signal
    })

    return result.data
  }

  /**
   * Stream a chat response from an AI agent via Server-Sent Events (SSE)
   * 
   * @param {Object} options
   * @param {string} options.agent - Agent ULID or unique name
   * @param {string} options.prompt - Prompt content
   * @param {string} [options.collection='agents'] - Collection where the agent is stored
   * @param {Array<{role: string, content: string}>} [options.messages] - Past messages history
   * @param {Array<File|Blob>} [options.attachments] - Files to attach/upload
   * @param {string} [options.outputType] - Structured JSON is not supported during streaming
   * @param {Object} [options.schema] - Structured JSON is not supported during streaming
   * @param {AbortSignal} [options.signal] - Cancellation signal
   * @returns {AsyncGenerator<Object>} Generator yielding parsed event objects
   * @throws {Error|SdkError}
   */
  chatStream(options = {}) {
    const {
      outputType,
      schema
    } = options

    if (outputType === 'json' || schema) {
      throw new Error('Streaming is not supported for structured output.')
    }

    return this._chatStreamImpl(options)
  }

  async *_chatStreamImpl(options = {}) {
    const {
      agent,
      prompt,
      collection = 'agents',
      messages,
      attachments,
      signal
    } = options

    const body = {
      agent,
      prompt,
      stream: true
    }

    if (messages) body.messages = messages
    if (attachments) body.attachments = attachments

    const formData = buildFormData(body)

    const byteStream = this.requestHelper.executeStream({
      method: 'POST',
      path: `/collections/${collection}/ai/chat`,
      body: formData ?? body,
      signal
    })

    const decoder = new TextDecoder()
    let buffer = ''

    for await (const chunk of byteStream) {
      buffer += decoder.decode(chunk, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) {
          continue
        }
        const dataStr = line.slice(6).trim()
        if (dataStr === '[DONE]') {
          return
        }
        try {
          yield JSON.parse(dataStr)
        } catch (_) {
          // Ignore parse errors
        }
      }
    }

    if (buffer.trim() && buffer.startsWith('data: ')) {
      const dataStr = buffer.slice(6).trim()
      if (dataStr !== '[DONE]') {
        try {
          yield JSON.parse(dataStr)
        } catch (_) {}
      }
    }
  }
}
