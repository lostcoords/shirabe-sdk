import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createShirabeOAuth } from "../src/oauth.js";

const secret = "test-state-secret-with-at-least-32-characters";
const requests: Request[] = [];
const oauth = createShirabeOAuth({
  baseUrl: "https://shirabe.test/",
  clientId: "example-reader",
  clientSecret: "client-secret",
  redirectUri: "https://example-reader.test/link/shirabe/callback",
  stateSecret: secret,
  scopes: ["user:dictionary:read"],
  fetch: async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    requests.push(request);
    if (request.url.endsWith("/oauth/revoke")) return new Response(null, { status: 200 });
    return Response.json({
      access_token: "access",
      refresh_token: "refresh",
      token_type: "Bearer",
      expires_in: 3600,
      scope: "user:dictionary:read",
    });
  },
});

test("browser authorization binds PKCE, resource and the subject to a single flow", async () => {
  requests.length = 0;
  const { authorizeUrl, state } = oauth.begin("reader-42");
  const url = new URL(authorizeUrl);
  assert.equal(url.origin + url.pathname, "https://shirabe.test/oauth/authorize");
  assert.equal(url.searchParams.get("resource"), "https://shirabe.test/api/v1");
  assert.equal(url.searchParams.get("scope"), "user:dictionary:read");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("state"), state);
  assert.ok(!state.includes("reader-42"));

  const token = await oauth.complete({ code: "one-time-code", state, subject: "reader-42", issuer: "https://shirabe.test" });
  assert.equal(token.access_token, "access");
  const body = await requests[0]?.json();
  assert.equal(body.grant_type, "authorization_code");
  assert.equal(body.code, "one-time-code");
  assert.equal(body.client_id, "example-reader");
  assert.equal(body.client_secret, "client-secret");
  assert.equal(body.redirect_uri, "https://example-reader.test/link/shirabe/callback");
  assert.equal(body.resource, "https://shirabe.test/api/v1");
  assert.equal(createHash("sha256").update(body.code_verifier).digest("base64url"), url.searchParams.get("code_challenge"));
});

test("a callback for another user, a changed state, or another issuer makes no token request", async () => {
  requests.length = 0;
  const { state } = oauth.begin("reader-42");
  await assert.rejects(oauth.complete({ code: "code", state, subject: "reader-43" }), { code: "subject_mismatch" });
  await assert.rejects(oauth.complete({ code: "code", state: `${state}x`, subject: "reader-42" }), { code: "invalid_state" });
  await assert.rejects(oauth.complete({ code: "code", state, subject: "reader-42", issuer: "https://other.test" }), { code: "invalid_issuer" });
  assert.equal(requests.length, 0);
});

test("refresh and revoke use the same client and resource", async () => {
  requests.length = 0;
  await oauth.refresh("old-refresh");
  await oauth.revoke("old-refresh");
  const refresh = await requests[0]?.json();
  const revoke = await requests[1]?.json();
  assert.equal(refresh.grant_type, "refresh_token");
  assert.equal(refresh.refresh_token, "old-refresh");
  assert.equal(refresh.resource, "https://shirabe.test/api/v1");
  assert.equal(revoke.token, "old-refresh");
  assert.equal(revoke.client_id, "example-reader");
});

// @ts-expect-error Unknown scope names must fail at compile time.
createShirabeOAuth({ clientId: "a", clientSecret: "b", redirectUri: "https://a.test", stateSecret: secret, scopes: ["user:dict:read"] });
