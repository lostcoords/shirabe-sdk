import assert from "node:assert/strict";
import test from "node:test";
import { ShirabePublicClient, type PublicCredentials } from "../src/public-oauth.js";

test("a public client renews early, uses its valid bearer during an outage, and retries later", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  let renewals = 0;
  const saved: PublicCredentials[] = [];
  t.mock.method(globalThis, "fetch", async () => {
    renewals++;
    return renewals === 1
      ? Response.json({ error: "server_error" }, { status: 503 })
      : Response.json({ access_token: "new", refresh_token: "next", expires_in: 1000, scope: "user:dictionary:read" });
  });
  const client = new ShirabePublicClient({
    baseUrl: "https://shirabe.test", clientId: "extension", scopes: ["user:dictionary:read"],
    onCredentials: async (credentials) => { saved.push(credentials); },
    credentials: {
      accessToken: "old", refreshToken: "old-refresh", scopes: ["user:dictionary:read"],
      accessTokenExpiresAt: new Date(now + 900_000).toISOString(),
      accessTokenRefreshAt: new Date(now).toISOString(),
    },
  });

  assert.equal(await client.authorization(), "Bearer old");
  assert.equal(await client.authorization(), "Bearer old");
  assert.equal(renewals, 1);
  now += 5 * 60_000;
  assert.equal(await client.authorization(), "Bearer new");
  assert.equal(renewals, 2);
  assert.equal(saved[0]?.accessTokenRefreshAt, new Date(now + 700_000).toISOString());
});

test("an in-flight renewal cannot restore credentials after a disconnect", async (t) => {
  let respond!: (response: Response) => void;
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  t.mock.method(globalThis, "fetch", () => {
    started();
    return new Promise<Response>((resolve) => { respond = resolve; });
  });
  const saved: PublicCredentials[] = [];
  const client = new ShirabePublicClient({
    baseUrl: "https://shirabe.test", clientId: "extension", scopes: ["user:dictionary:read"],
    onCredentials: async (credentials) => { saved.push(credentials); },
    credentials: {
      accessToken: "old", refreshToken: "old-refresh", scopes: ["user:dictionary:read"],
      accessTokenExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    },
  });

  const renewal = client.renew();
  await requestStarted;
  client.update("https://shirabe.test", {
    accessToken: "", accessTokenExpiresAt: "", refreshToken: "", scopes: [],
  });
  respond(Response.json({ access_token: "stale", refresh_token: "stale-refresh", expires_in: 1000, scope: "user:dictionary:read" }));
  await assert.rejects(renewal, /connection changed during renewal/);

  assert.deepEqual(saved, []);
  await assert.rejects(client.authorization(), /Not connected to Shirabe/);
});
