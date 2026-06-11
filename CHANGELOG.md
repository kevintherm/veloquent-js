## 1.5.0

- **Device ID**: Attached device id and user agent if available on requests to detect new login from different source.

## 1.6.0

- **Device ID**: Add persistent X-Device-ID header and configurable User-Agent support to request client.

## 1.6.1

- **Fix**: Resolve date/datetime serialization issues and enforce UTC timezone parsing for timezone-less datetime strings.

## 1.7.0

- **Offline Support**:
    - Implemented a plug-and-play `OfflineAdapter` that wraps any `HttpAdapter`.
    - Automatically queues `POST`, `PATCH`, and `DELETE` requests during network failures.
    - Replays queued requests in FIFO order when connectivity is restored.
    - Exposes callbacks `onQueued`, `onFlushed`, and `onFlushError` for custom event handling.
    - Automatically refreshes the auth token from storage during replay.
