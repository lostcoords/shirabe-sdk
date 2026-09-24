# @shirabe-org/api

Typed TypeScript client for Shirabe's public API. Request bodies, responses,
errors, and named operations are generated from `openapi/shirabe.yaml`.

```ts
import { createShirabeClient, search } from "@shirabe-org/api";

const client = createShirabeClient({ accessToken: process.env.SHIRABE_TOKEN });
const { data, error } = await search({
  client,
  body: {
    query: "猫",
    filters: {
      sources: [{ dictionary: "jmdict", languages: ["en"] }],
    },
  },
});
```

Run `npm run codegen` after changing the OpenAPI contract. Generated files are
committed so a consumer and the server change together.

## Connect a reader account from a server

The Node-only `@shirabe-org/api/oauth` entry point handles PKCE, sealed callback
state, resource binding, code exchange, refresh, and revocation. Keep the client
secret and returned token pair on your server; store the pair in your own database.

```ts
import { createShirabeOAuth } from "@shirabe-org/api/oauth";

const oauth = createShirabeOAuth({
  clientId: process.env.SHIRABE_CLIENT_ID!,
  clientSecret: process.env.SHIRABE_CLIENT_SECRET!,
  redirectUri: "https://example.com/shirabe/callback",
  stateSecret: process.env.STATE_SECRET!,
  scopes: ["user:dictionary:read"],
});

const { authorizeUrl } = oauth.begin(String(user.id));
// Redirect the reader to authorizeUrl.

const tokens = await oauth.complete({ code, state, subject: String(user.id), issuer: iss });
// Encrypt and store tokens.access_token and tokens.refresh_token in your database.

const renewed = await oauth.refresh(storedRefreshToken);
await oauth.revoke(storedRefreshToken);
```

`subject` binds the callback to the signed-in user who began the flow. Each
`begin` call creates a fresh PKCE verifier inside encrypted, 15-minute state.
`scopes` accepts only Shirabe's known user scope names at compile time.

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
