import assert from "node:assert/strict";
import test from "node:test";
import { createShirabeService, ShirabeServiceAuthError } from "../src/service.js";

test("service credentials use Basic auth, resource binding, and one cached renewal", async () => {
  const requests: Request[] = [];
  let granted = "dictionary:read";
  const service = createShirabeService({
    baseUrl: "https://shirabe.test/",
    clientId: "nadeshiko",
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
  assert.equal(requests[0]?.headers.get("authorization"), `Basic ${Buffer.from("nadeshiko:test-secret").toString("base64")}`);
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
  assert.ok(credential.expiresAt < Date.now() + 30_000);
  assert.equal(await service.accessToken(), "short-token");
  assert.equal(requests, 1);
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

// @ts-expect-error Unknown service scope names must fail at compile time.
createShirabeService({ clientId: "id", clientSecret: "secret", scope: "dictionary:write" });
