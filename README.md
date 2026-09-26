# Shirabe SDKs

This repository is being prepared as the public source home for Shirabe's TypeScript SDKs. The source and release automation have not moved here yet. Install the existing packages from npm:

| Package | Purpose |
| --- | --- |
| [`@shirabe-org/api`](https://www.npmjs.com/package/@shirabe-org/api) | Typed client for the Shirabe API |
| [`@shirabe-org/card`](https://www.npmjs.com/package/@shirabe-org/card) | Word card renderer and API host adapters |

The packages will live in `packages/api` and `packages/card` as npm workspaces. Each package will keep its own version and release tag. Pushes to `main` will publish dev builds, and package-specific version tags will publish stable builds. The card depends on an exact API package version, so that API version must be published first.

The API client is generated from Shirabe's OpenAPI contract. Moving the packages here will also require a public contract snapshot and a way to keep it synchronized with the service. The Shirabe app and extension will continue to consume the SDK packages after the move.

## Status

Repository setup only. There is no SDK source or release workflow here yet. See [the migration outline](docs/migration.md) for the remaining work.

## License

The SDKs use the [MIT License](LICENSE). This license does not cover the Shirabe service or dictionary data returned by its API.
