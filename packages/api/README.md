# @shirabe-org/api

Typed TypeScript client for Shirabe's public API. Request bodies, responses,
errors, and named operations are generated from `openapi/shirabe.yaml`.

For a server integration, import the Node-only client. It uses the service
identity for ordinary calls and provides a separate context for each reader.
The scope names are one typed `ShirabeScope` union. Only `user:` scopes appear
on the consent screen.

```ts
import { createShirabeClient } from "@shirabe-org/api/server";

const shirabe = createShirabeClient({
  clientId: process.env.SHIRABE_CLIENT_ID!,
  clientSecret: process.env.SHIRABE_CLIENT_SECRET!,
  scopes: ["dictionary:read", "user:dictionary:read"],
  link: {
    redirectUri: "https://example.com/shirabe/callback",
    stateSecret: process.env.STATE_SECRET!,
  },
});

const parsed = await shirabe.parse({ texts: ["猫"] });
const reader = shirabe.asUser(storedAccessToken);
const identified = await reader.identifyWords({ tokens: [{ lemma: "猫" }] });

const { authorizeUrl } = shirabe.link.begin(String(user.id));
const tokens = await shirabe.link.complete({
  code,
  state,
  subject: String(user.id),
  issuer: iss,
});
// Encrypt and store the access and refresh tokens against your user.
const renewed = await shirabe.link.refresh(storedRefreshToken);
await shirabe.link.revoke(storedRefreshToken);
```

`link.begin` generates PKCE and encrypted callback state. `link.complete`
returns credentials; your application stores them and supplies a reader access
token to `asUser` for each request. `getCredential()` exposes the shared service
token, its actual `expiresAt`, and the next `refreshAt` for a trusted internal proxy.
The service bearer lasts 24 hours. The SDK starts renewal after 75% of the
returned lifetime and keeps a still-valid bearer available if renewal fails
temporarily; it retries later with backoff.

Browser and token-only consumers import `createShirabeClient` from the package
root and pass `accessToken`. A public browser client can use `ShirabePublicClient`
to manage authorization-code PKCE, refresh-token rotation, and one retry after a 401. It uses Web Crypto and requires no client secret. The host opens the URL,
stores credentials, and supplies its redirect URI.

```ts
import { ShirabePublicClient } from "@shirabe-org/api";

const oauth = new ShirabePublicClient({
  baseUrl: "https://shirabe.org",
  clientId: "my-public-client",
  scopes: ["user:profile:read"],
  credentials: storedCredentials,
  onCredentials: saveCredentials,
  onSignedOut: clearCredentials,
});
const flow = await oauth.begin(redirectUri);
const callbackUrl = await openAuthorizationWindow(flow.url);
const credentials = await oauth.complete(callbackUrl, flow);
await saveCredentials(credentials);
```

Both clients expose named, typed methods generated from the OpenAPI operations.
Operations with only a request body take that body as their first argument;
other operation options, such as headers or a signal, are the second argument.
Operations with path or query parameters take the OpenAPI option object.

Run `npm run codegen --workspace @shirabe-org/api` after changing the OpenAPI
contract. The generator creates endpoint functions, response types, and the
bound client methods together.

Build and verify it from the repository root:

```sh
npm run build --workspace @shirabe-org/api
npm test --workspace @shirabe-org/api
npm run typecheck --workspace @shirabe-org/api
bin/package-check
```

`bin/package-check` regenerates the client in a temporary directory, packs the
package, installs that tarball into a clean consumer, imports its JavaScript,
and type-checks its public declarations.

## Release

Publish a GitHub release whose tag matches the manifest version:

```sh
api-v0.6.1
```

`.github/workflows/npm-release.yml` verifies both package tarballs, then
publishes this one through npm trusted publishing. Publish the API before
`@shirabe-org/card`, which declares its released version as a dependency.

## License

The client SDK is available under the [MIT License](LICENSE). The license does
not cover the Shirabe service or the dictionary data returned by the API.
