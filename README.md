# Shirabe SDKs

Public TypeScript SDKs for [Shirabe](https://shirabe.org).

| Package | Purpose |
| --- | --- |
| [`@shirabe-org/api`](packages/api) | Typed client generated from Shirabe's OpenAPI contract |
| [`@shirabe-org/card`](packages/card) | Word card renderer and API host adapters |

The packages share a repository but remain independent releases. Each has its own manifest, version, tests, npm package, and release tag. The card declares an exact API dependency, so release that API version first.

## Development

Use Node 24 or newer.

```sh
npm install
npm run check
```

`packages/api/openapi/shirabe.bundled.yaml` is the reviewed service contract snapshot used for client generation. Update it from a file or URL with:

```sh
script/update-openapi [contract]
```

With no argument, the script fetches the deployed contract from `https://shirabe.org/openapi.yaml`. It regenerates the client and verifies the API package before returning.

## Releases

Publish a GitHub release tagged `api-v<version>` or `card-v<version>`. The release workflow checks that the tag matches the selected package manifest, verifies both package archives from a clean consumer, and publishes through npm trusted publishing.

The npm trusted publisher for each package must name this repository and `.github/workflows/npm-release.yml`.

## License

The SDKs use the [MIT License](LICENSE). This license does not cover the Shirabe service or dictionary data returned by its API.
