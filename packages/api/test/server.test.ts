import assert from "node:assert/strict";
import test from "node:test";
import { createShirabeClient } from "../src/server.js";

test("one server client uses service credentials by default and isolates a reader request", async () => {
  const requests: Request[] = [];
  const client = createShirabeClient({
    baseUrl: "https://shirabe.test/",
    clientId: "example-reader",
    clientSecret: "test-secret",
    scopes: ["dictionary:read", "user:dictionary:read"],
    headers: { "x-sdk-client": "integration-test" },
    link: {
      redirectUri: "https://example-reader.test/callback",
      stateSecret: "a-state-secret-with-at-least-32-characters",
    },
    fetch: async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push(request);
      if (request.url.endsWith("/oauth/token")) {
        return Response.json({ access_token: "service-token", token_type: "Bearer", expires_in: 3600, scope: "dictionary:read" });
      }
      return Response.json({ results: [] });
    },
  });

  await client.parse({ texts: ["猫"] });
  await client.asUser("reader-token").parse({ texts: ["犬"] });
  await client.parse({ texts: ["鳥"] });

  assert.equal(requests.length, 4);
  assert.deepEqual(requests.filter((request) => request.url.endsWith("/parse")).map((request) =>
    request.headers.get("authorization")), ["Bearer service-token", "Bearer reader-token", "Bearer service-token"]);
  assert.ok(requests.every((request) => request.headers.get("x-sdk-client") === "integration-test"));
  assert.deepEqual(await requests[1]?.json(), { texts: ["猫"] });
  assert.equal((await client.getCredential()).token, "service-token");
  assert.equal(requests.length, 4);

  const { authorizeUrl } = client.link.begin("reader-42");
  const url = new URL(authorizeUrl);
  assert.equal(url.searchParams.get("scope"), "user:dictionary:read");
  assert.equal(url.searchParams.get("resource"), "https://shirabe.test/api/v1");
});

test("scope names and operation bodies are checked at compile time", () => {
  const client = createShirabeClient({ clientId: "id", clientSecret: "secret", scopes: ["dictionary:read"] });
  if (false) {
    // @ts-expect-error Unknown scope is not accepted.
    createShirabeClient({ clientId: "id", clientSecret: "secret", scopes: ["user:dictionary:reed"] });
    // @ts-expect-error A parse call needs the OpenAPI request body.
    void client.parse({ word: "猫" });
  }
  assert.equal(typeof client.parse, "function");
});
