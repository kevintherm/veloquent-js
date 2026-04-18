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
    this.activeChannels = new Map() // channelName -> { echoChannel, timer, lastHeartbeat, listeners: Set, subscriptions: Map }
    this.collectionToChannel = new Map() // collection -> channelName

    // Browser-only optimization: refresh subscriptions when the tab becomes visible
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      this._handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          this.activeChannels.forEach((_, channelName) => {
            this.performHeartbeat(channelName, true)
          })
        }
      }
      document.addEventListener('visibilitychange', this._handleVisibilityChange)
    }
  }

  /**
   * Perform heartbeat for a specific channel by refreshing all its subscriptions
   * @param {string} channelName 
   * @param {boolean} [isPulse=false] - If true, this is a visibility-triggered pulse (subject to throttle)
   */
  async performHeartbeat(channelName, isPulse = false) {
    const channelInfo = this.activeChannels.get(channelName)
    if (!channelInfo) return

    // Throttle only visibility-triggered pulses to avoid spamming requests (e.g. rapid tab switching)
    const now = Date.now()
    if (isPulse && channelInfo.lastHeartbeat && (now - channelInfo.lastHeartbeat) < 2000) {
      return
    }
    channelInfo.lastHeartbeat = now

    const tasks = []
    channelInfo.subscriptions.forEach((options, collection) => {
      tasks.push(
        this.requestHelper.execute({
          method: 'POST',
          path: `/collections/${collection}/subscribe`,
          body: { filter: (options && options.filter) || null }
        }).catch(() => { /* silence heartbeat errors */ })
      )
    })

    await Promise.all(tasks)
  }

  /**
   * Disconnect from all realtime channels
   */
  disconnect() {
    if (typeof document !== 'undefined' && this._handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange)
    }

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
      throw new Error('SDK: Realtime adapter is not configured. Pass it in Veloquent config.')
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

      channelInfo = {
        echoChannel,
        timer: null,
        lastHeartbeat: Date.now(),
        listeners: new Set(),
        subscriptions: new Map()
      }

      // Start periodic heartbeat for this specific channel
      channelInfo.timer = setInterval(() => {
        this.performHeartbeat(channelName, false)
      }, this.heartbeatMs)

      this.activeChannels.set(channelName, channelInfo)

      // Register default record listeners once for this channel
      const events = ['created', 'updated', 'deleted']
      events.forEach((eventName) => {
        const fullEventName = `record.${eventName}`
        const dispatch = (payload) => {
          // Flatten the payload if it's the standard Veloquent envelope
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

    // 3. Add the callback and subscription to this channel
    channelInfo.listeners.add({ collection, callback })
    channelInfo.subscriptions.set(collection, options)
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
      // Remove specific callback and subscription
      channelInfo.listeners.forEach((listener) => {
        if (listener.collection === collection) {
          channelInfo.listeners.delete(listener)
        }
      })
      channelInfo.subscriptions.delete(collection)

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
