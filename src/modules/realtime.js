/**
 * Realtime module for listening to collection changes
 * @module modules/realtime
 */

/**
 * Realtime module - Handle live subscriptions to collection changes
 * @class
 */
export class Realtime {
  /**
   * @param {import('../core/request.js').RequestHelper} requestHelper
   * @param {Object} [adapter] - Optional realtime adapter (e.g., Echo adapter)
   */
  constructor(requestHelper, adapter) {
    this.requestHelper = requestHelper
    this.adapter = adapter
    this.heartbeatMs = 30000
    this.activeChannels = new Map() // channelName -> { echoChannel, timer, listeners: Set<{ collection, callback }> }
    this.collectionToChannel = new Map() // collection -> channelName
  }

  /**
   * Disconnect from all realtime channels
   */
  disconnect() {
    this.activeChannels.forEach((sub, channelName) => {
      clearInterval(sub.timer)
      this.adapter.leave(channelName)
    })
    this.activeChannels.clear()
    this.collectionToChannel.clear()
    this.adapter.disconnect();
  }

  /**
   * Subscribe to a collection for realtime events
   * @param {string} collection - The collection name
   * @param {Object} options - Subscription options (filter, channel)
   * @param {Function} callback - Event handler function (event, payload) => void
   */
  async subscribe(collection, options = {}, callback) {
    if (!this.adapter) {
      throw new Error('SDK: Realtime adapter is not configured. Pass it in VeloPHP config.')
    }

    // 1. Inform server about the subscription
    const response = await this.requestHelper.execute({
      method: 'POST',
      path: `/collections/${collection}/subscribe`,
      body: { filter: (options && options.filter) || null }
    })

    const rawChannelName = (options && options.channel) || (response.data && response.data.channel)
    if (!rawChannelName) {
      throw new Error('SDK: Channel name is required (pass it in options or ensure server returns it).')
    }

    const channelName = rawChannelName.startsWith('private-')
      ? rawChannelName.substring(8)
      : rawChannelName

    // 2. Manage channel connection deduplication
    let channelInfo = this.activeChannels.get(channelName)

    if (!channelInfo) {
      const echoChannel = this.adapter.private(channelName)

      // Start heartbeat for this specific channel
      const timer = setInterval(async () => {
        try {
          // Re-subscribing to any collection on this channel refreshes the channel's TTL in the backend
          await this.requestHelper.execute({
            method: 'POST',
            path: `/collections/${collection}/subscribe`,
            body: { filter: (options && options.filter) || null }
          })
        } catch (error) { /* silence heartbeat errors */ }
      }, this.heartbeatMs)

      channelInfo = {
        echoChannel,
        timer,
        listeners: new Set()
      }

      this.activeChannels.set(channelName, channelInfo)

      // Register default record listeners once for this channel
      const events = ['created', 'updated', 'deleted']
      events.forEach((eventName) => {
        const fullEventName = `record.${eventName}`
        const dispatch = (payload) => {
          // Flatten the payload if it's the standard Velo envelope
          const dataToReturn = (payload && payload.record) ? payload.record : payload;

          // Filter by collection if the server provided it
          const collectionName = dataToReturn._collection || payload._collection
          
          // Dispatch to all collection listeners on this channel
          channelInfo.listeners.forEach((listener) => {
            if (collectionName && collectionName !== listener.collection) {
              return
            }
            if (typeof listener.callback === 'function') {
              listener.callback(fullEventName, dataToReturn)
            }
          })
        }
        // User snippet used dot prefix: .record.${eventName}
        echoChannel.listen(`.${fullEventName}`, dispatch)
      })
    }

    // 3. Add the callback to this channel's listeners
    channelInfo.listeners.add({ collection, callback })
    this.collectionToChannel.set(collection, channelName)

    return channelName
  }

  /**
   * Unsubscribe from a collection
   * @param {string} collection 
   */
  async unsubscribe(collection) {
    const channelName = this.collectionToChannel.get(collection)
    if (!channelName) return

    try {
      await this.requestHelper.execute({
        method: 'DELETE',
        path: `/collections/${collection}/subscribe`
      })
    } catch (e) { /* ignore unsubscribe API errors */ }

    const channelInfo = this.activeChannels.get(channelName)
    if (channelInfo) {
      // Remove specific callback
      channelInfo.listeners.forEach((listener) => {
        if (listener.collection === collection) {
          channelInfo.listeners.delete(listener)
        }
      })

      // If no more listeners on this channel, leave it
      if (channelInfo.listeners.size === 0) {
        clearInterval(channelInfo.timer)
        this.adapter.leave(channelName)
        this.activeChannels.delete(channelName)
      }
    }
    this.collectionToChannel.delete(collection)
  }
}
