import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { VeloPHP, createFetchAdapter, createEchoAdapter } from "../src/index.js";
import Echo from "laravel-echo";

// Use require to fetch the exactly correct CommonJS export for pusher-js in bun test
const Pusher = require("pusher-js");

// Workaround for Bun ESM/CJS interop where `new options.client()` returns the class instead of instance inside laravel-echo
class PusherWrapper {
  constructor(key, options) {
    return new Pusher(key, options);
  }
}

// Make Pusher available globally
globalThis.window = globalThis;
globalThis.Pusher = Pusher;

Pusher.logToConsole = true;

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

/**
 * REALTIME INTEGRATION TEST
 * Requires a live VeloPHP server at http://localhost:80
 * Uses credentials from .env to connect to the realtime broadcaster.
 */
describeIntegration("Live Realtime Integration", () => {
  const storageData = {};
  let sdk;
  let testUser;
  let echoInstance;

  beforeAll(() => {
    sdk = new VeloPHP({
      apiUrl: "http://localhost:80",
      http: createFetchAdapter(),
      storage: {
        isAsync: false,
        getItem: (k) => storageData[k] ?? null,
        setItem: (k, v) => { storageData[k] = v; },
        removeItem: (k) => { delete storageData[k]; },
        clear: () => { Object.keys(storageData).forEach(k => delete storageData[k]); }
      }
    });

    testUser = {
      email: `test_rt_${Date.now()}@gmail.com`,
      password: "password123",
      collection: "users"
    };
  });

  afterAll(async () => {
    if (sdk) {
      sdk.realtime?.disconnect();
      try {
        await sdk.auth.logout(testUser.collection);
      } catch (e) {
        // ignore
      }
    }
  });

  test("Integration: Should execute complete realtime flow", async () => {
    // 1. Create user
    const user = await sdk.records.create(testUser.collection, {
      name: "Realtime Integration User",
      email: testUser.email,
      password: testUser.password,
    });
    expect(user).toBeDefined();
    expect(user.id).toBeDefined();

    // 2. Login to get token for Echo auth
    const loginRes = await sdk.auth.login(testUser.collection, testUser.email, testUser.password);
    expect(loginRes.token).toBeDefined();

    // Initialize Echo with Reverb credentials from .env
    echoInstance = new Echo({
      broadcaster: 'pusher',
      key: process.env.REALTIME_KEY || 'ad8w3cv7c0ljex3m9xs2',
      wsHost: 'localhost',
      wsPort: 8080,
      forceTLS: false,
      encrypted: false,
      disableStats: true,
      cluster: 'ap1',
      enabledTransports: ['ws'],
      authEndpoint: `http://localhost:80/api/broadcasting/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${loginRes.token}`,
        },
      },
    });

    echoInstance.connector.pusher.connection.bind('connected', () => {
      console.log('Echo Reverb Connected!');
    });
    echoInstance.connector.pusher.connection.bind('error', (err) => {
      console.error('Echo Reverb Error:', err);
    });

    // Add global listener to see everything
    echoInstance.connector.pusher.bind_global((name, data) => {
      console.log(`[GLOBAL EVENT] ${name}:`, data);
    });

    // Inject the realtime adapter into the existing SDK instance
    const adapter = createEchoAdapter(echoInstance);
    sdk.config.realtime = adapter;
    sdk.realtime.adapter = adapter;

    const userEvents = [];
    const postEvents = [];

    // 3. Subscribe to collections: users and posts
    // We create promises to wait for subscription success
    const subscribeTo = (collection, eventsArr) => {
      return new Promise(async (resolve, reject) => {
        try {
          const channelName = await sdk.realtime.subscribe(collection, {}, (event, payload) => {
            console.log(`[Realtime Event Received for ${collection}] ${event}`, payload);
            eventsArr.push({ event, payload });
          });

          // Access the underlying pusher channel to listen for subscription success
          // This is a bit of a hack but necessary to "check if the auth is succeed first"
          const channelInfo = sdk.realtime.activeChannels.get(channelName.startsWith('private-') ? channelName.substring(8) : channelName);
          if (channelInfo && channelInfo.echoChannel.subscription) {
            channelInfo.echoChannel.subscription.bind('pusher:subscription_succeeded', () => {
              console.log(`[TEST] Subscription succeeded for ${collection} on channel ${channelName}`);
              resolve(channelName);
            });
            channelInfo.echoChannel.subscription.bind('pusher:subscription_error', (err) => {
              console.error(`[TEST] Subscription error for ${collection}:`, err);
              reject(err);
            });
          } else {
            // Fallback for non-pusher adapters or if subscription object isn't ready
            setTimeout(() => resolve(channelName), 2000);
          }
        } catch (e) {
          reject(e);
        }
      });
    };

    console.log("Subscribing to channels...");
    await Promise.all([
      subscribeTo('users', userEvents),
      subscribeTo('posts', postEvents)
    ]);

    console.log("Both channels subscribed and authenticated!");

    // 4. Create posts record
    // We pass the socket ID so Reverb DOES NOT exclude us (or if it does, we know why)
    // Actually, by default Reverb EXCLUDES the sender if X-Socket-ID matches.
    // So we DON'T pass it if we WANT to receive our own event.
    const createdPost = await sdk.records.create('posts', {
      title: "Realtime Integration Post",
      content: "This record was purely created to test websocket broadcast."
    });
    expect(createdPost.id).toBeDefined();

    // Wait for the websocket event to propagate
    await new Promise(r => setTimeout(r, 500));

    console.log("POST EVENTS RECEIVED:", postEvents);
    console.log("USER EVENTS RECEIVED:", userEvents);

    // Test receive "created" event
    // The SDK now flattens the payload to the record but we should check e.payload.id
    const createEvent = postEvents.find(e => e.event === 'record.created' && e.payload.id === createdPost.id);
    expect(createEvent).toBeDefined();
    expect(createEvent.payload.title).toBe("Realtime Integration Post");

    // Verify that the user event list DID NOT receive the post creation event
    expect(userEvents.length).toBe(0);

    // 5. Delete the record
    postEvents.length = 0; // reset array
    await sdk.records.delete('posts', createdPost.id);

    // Wait for the websocket event to propagate
    await new Promise(r => setTimeout(r, 500));

    // Test receive "deleted" event
    const deleteEvent = postEvents.find(e => e.event === 'record.deleted' && e.payload.id === createdPost.id);
    expect(deleteEvent).toBeDefined();
    expect(deleteEvent.payload.id).toBe(createdPost.id);

  }, 60000); // 60 seconds timeout
});
