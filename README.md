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

With no argument, the script fetches the deployed contract from `https://shirabe.org/openapi.yaml`. It regenerates the client and verifies the API package before returning. A new contract version sets the API manifest to that exact version, updates the card dependency, and increments the card patch version. The daily `openapi-update.yml` workflow runs the full package checks and saves a patch for review. It also opens a PR when repository policy permits; it does not publish releases.

## Releases

Publish a GitHub release tagged `api-v<version>` or `card-v<version>`. The release workflow checks that the tag matches the selected package manifest, verifies both package archives from a clean consumer, and publishes through npm trusted publishing.

With npm 11.19.1, configure both trusted publishers for this repository:

```sh
npm trust github @shirabe-org/api --repository lostcoords/shirabe-sdk --file npm-release.yml --allow-publish
npm trust github @shirabe-org/card --repository lostcoords/shirabe-sdk --file npm-release.yml --allow-publish
```

Enter only `npm-release.yml` as the workflow filename, not its full path. Verify each configuration with `npm trust list <package>`. Complete the first successful SDK release before revoking the old Shirabe publisher.

After npm makes both releases available, verify the published archives and a clean registry installation:

```sh
bin/package-check --registry
```

This also verifies npm registry signatures and provenance attestations.

## License

The SDKs use the [MIT License](LICENSE). This license does not cover the Shirabe service or dictionary data returned by its API.
