import { expect, test, describe } from "bun:test";
import { VeloPHP, createFetchAdapter } from "../src/index.js";

const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";
const describeIntegration = runIntegration ? describe : describe.skip;

/**
 * INTEGRATION TEST
 * This test expects a live VeloPHP server running at http://localhost:80
 * Note: Assumes the server has a collection named 'users' (auth) and 'posts' (records) with 'posts' collection's api_rules set to allow all
 */
describeIntegration("Live Server Integration", () => {
  const storageData = {};

  const sdk = new VeloPHP({
    apiUrl: "http://localhost:80",
    http: createFetchAdapter(),
    storage: {
      isAsync: false,
      getItem: (key) => storageData[key] ?? null,
      setItem: (key, value) => {
        storageData[key] = value;
      },
      removeItem: (key) => {
        delete storageData[key];
      },
      clear: () => {
        Object.keys(storageData).forEach((key) => delete storageData[key]);
      }
    }
  });

  // These should be updated to match your local setup's seeds/data
  const testUser = {
    email: `test${Date.now()}@gmail.com`,
    password: "password123",
    collection: "users"
  };

  test("Integration: Should register and return the created user", async () => {
    // 1. Register
    const registerRes = await sdk.records.create(
      testUser.collection,
      {
        name: "Integration Test User",
        email: testUser.email,
        password: testUser.password,
      }
    );

    expect(registerRes).toBeDefined();
    expect(registerRes.email).toBe(testUser.email);
  });

  test("Integration: Should login and fetch current user profile", async () => {
    // 1. Login
    const loginRes = await sdk.auth.login(
      testUser.collection,
      testUser.email,
      testUser.password
    );

    expect(loginRes).toBeDefined();
    expect(sdk.auth.isAuthenticated()).toBe(true);

    // 2. Fetch Profile (Me)
    const profile = await sdk.auth.me(testUser.collection);
    expect(profile.email).toBe(testUser.email);
  });

  test("Integration: Should perform CRUD on 'posts' collection", async () => {
    const collection = "posts";
    const title = `Integration Post ${Date.now()}`;

    // 1. Create
    const created = await sdk.records.create(collection, {
      title,
      content: "This was created by the integration test."
    });
    expect(created.id).toBeDefined();
    expect(created.title).toBe(title);

    // 2. Read (List with filter)
    const list = await sdk.records.list(collection, {
      filter: `title = "${title}"`
    });
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].id).toBe(created.id);

    // // 3. Update
    const updated = await sdk.records.update(collection, created.id, {
      title: `${title} (Updated)`,
      content: created.content,
    });
    expect(updated.title).toContain("(Updated)");

    // 4. Delete
    await sdk.records.delete(collection, created.id);

    // Verify deletion (should fail or return empty list)
    const afterDelete = await sdk.records.list(collection, {
      filter: `title = "${title}"`
    });
    expect(afterDelete.length).toBe(0);
  });

  test("Integration: Should logout successfully", async () => {
    await sdk.auth.logout(testUser.collection);
    expect(sdk.auth.isAuthenticated()).toBe(false);
  });
});
