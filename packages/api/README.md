# @shirabe-org/api

Typed TypeScript client for Shirabe's public API. Request bodies, responses,
errors, and named operations are generated from `openapi/shirabe.yaml`.

```ts
import { createShirabeClient, search } from "@shirabe-org/api";

const client = createShirabeClient({ accessToken: process.env.SHIRABE_TOKEN });
const { data, error } = await search({
  client,
  body: { query: "猫", definitionLanguages: ["en"] },
});
```

Run `npm run codegen` after changing the OpenAPI contract. Generated files are
committed so a consumer and the server change together.

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
api-v0.5.0
```

`.github/workflows/npm-release.yml` verifies both package tarballs, then
publishes this one through npm trusted publishing. Publish the API before
`@shirabe-org/card`, which declares its released version as a dependency.

## License

The client SDK is available under the [MIT License](LICENSE). The license does
not cover the Shirabe service or the dictionary data returned by the API.
