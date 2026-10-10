import assert from "node:assert/strict";
import test from "node:test";
import { createShirabeService, ShirabeServiceAuthError } from "../src/service.js";

test("service credentials use Basic auth, resource binding, and one cached renewal", async () => {
  const requests: Request[] = [];
  let granted = "dictionary:read";
  const service = createShirabeService({
    baseUrl: "https://shirabe.test/",
    clientId: "example-reader",
    clientSecret: "test-secret",
    scope: "dictionary:read",
    fetch: async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      return Response.json({ access_token: "service-token", token_type: "Bearer", expires_in: 3600, scope: granted });
    },
  });

  const [first, second] = await Promise.all([service.accessToken(), service.accessToken()]);
  assert.equal(first, "service-token");
  assert.equal(second, first);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.headers.get("authorization"), `Basic ${Buffer.from("example-reader:test-secret").toString("base64")}`);
  assert.deepEqual(await requests[0]?.json(), { grant_type: "client_credentials", resource: "https://shirabe.test/api/v1" });
  const credential = await service.credential();
  assert.equal(credential.token, first);
  assert.ok(credential.expiresAt > Date.now());
  assert.equal(requests.length, 1);

  service.clear();
  granted = "user:dictionary:read";
  await assert.rejects(service.accessToken(), (error) =>
    error instanceof ShirabeServiceAuthError && error.detail &&
    (error.detail as { scope?: string }).scope === "user:dictionary:read");
});

test("short lived service tokens remain usable and are cached", async () => {
  let requests = 0;
  const service = createShirabeService({
    clientId: "id", clientSecret: "secret", scope: "dictionary:read",
    fetch: async () => {
      requests++;
      return Response.json({ access_token: "short-token", token_type: "Bearer", expires_in: 30, scope: "dictionary:read" });
    },
  });
  const credential = await service.credential();
  assert.ok(credential.expiresAt > Date.now());
  assert.ok(credential.refreshAt > Date.now());
  assert.ok(credential.refreshAt < credential.expiresAt);
  assert.equal(await service.accessToken(), "short-token");
  assert.equal(requests, 1);
});

test("service renewal starts at three quarters of lifetime and survives a temporary failure", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  let requests = 0;
  const service = createShirabeService({
    clientId: "id", clientSecret: "secret", scope: "dictionary:read",
    fetch: async () => {
      requests++;
      if (requests === 2) return Response.json({ error: "temporarily_unavailable" }, { status: 503 });
      return Response.json({ access_token: `token-${requests}`, token_type: "Bearer", expires_in: 86_400, scope: "dictionary:read" });
    },
  });
  assert.equal(await service.accessToken(), "token-1");
  now += 18 * 60 * 60 * 1000;
  assert.equal(await service.accessToken(), "token-1");
  assert.equal(requests, 2);
  const credential = await service.credential();
  assert.equal(credential.refreshAt, now + 60_000);
  assert.equal(credential.expiresAt, 1_000_000 + 86_400_000);
  now += 60_000;
  assert.equal(await service.accessToken(), "token-3");
  assert.equal(requests, 3);
});

test("service renewal does not hide rejected client credentials behind an old bearer", async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  let requests = 0;
  const service = createShirabeService({
    clientId: "id", clientSecret: "secret", scope: "dictionary:read",
    fetch: async () => ++requests === 1
      ? Response.json({ access_token: "old", token_type: "Bearer", expires_in: 86_400, scope: "dictionary:read" })
      : Response.json({ error: "invalid_client" }, { status: 401 }),
  });
  assert.equal(await service.accessToken(), "old");
  now += 18 * 60 * 60 * 1000;
  await assert.rejects(service.accessToken(), (error) =>
    error instanceof ShirabeServiceAuthError && error.status === 401);
});

test("clearing credentials cannot restore an in-flight old token", async () => {
  const replies: Array<(response: Response) => void> = [];
  const service = createShirabeService({
    clientId: "id", clientSecret: "secret", scope: "dictionary:read",
    fetch: () => new Promise<Response>((resolve) => { replies.push(resolve); }),
  });
  const oldRequest = service.accessToken();
  await Promise.resolve();
  service.clear();
  const newRequest = service.accessToken();
  await Promise.resolve();
  assert.equal(replies.length, 2);
  replies[0]!(Response.json({ access_token: "old", token_type: "Bearer", expires_in: 3600, scope: "dictionary:read" }));
  await assert.rejects(oldRequest, /cleared during token request/);
  replies[1]!(Response.json({ access_token: "new", token_type: "Bearer", expires_in: 3600, scope: "dictionary:read" }));
  assert.equal(await newRequest, "new");
  assert.equal((await service.credential()).token, "new");
});

test("malformed service tokens fail with an SDK auth error", async () => {
  const service = createShirabeService({
    clientId: "id", clientSecret: "secret", scope: "dictionary:read",
    fetch: async () => Response.json({ access_token: "token", token_type: "Bearer", expires_in: 30 }),
  });
  await assert.rejects(service.accessToken(), (error) =>
    error instanceof ShirabeServiceAuthError &&
    (error.detail as { message?: string }).message === "Shirabe returned an invalid service token");
});

// @ts-expect-error Unknown service scope names must fail at compile time.
createShirabeService({ clientId: "id", clientSecret: "secret", scope: "dictionary:write" });
