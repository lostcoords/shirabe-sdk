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
npx playwright install chromium
npm run test:theme --workspace @shirabe-org/card
npm run test:lookup --workspace @shirabe-org/card
```

`packages/api/openapi/shirabe.bundled.yaml` is the reviewed service contract snapshot used for client generation. Update it from a file or URL with:

```sh
script/update-openapi [contract]
```

With no argument, the script fetches the deployed contract from `https://shirabe.org/openapi.yaml`. It regenerates the client and verifies the API package before returning. A new contract version sets the API manifest to that exact version, updates the card dependency, and increments the card patch version.

## Releases

### Backend-driven releases

Bump `info.version` in Shirabe's `openapi/shirabe.yaml`, regenerate and commit `openapi/dist/shirabe.bundled.yaml`, and release Shirabe through its production workflow. After production smoke tests and image promotion pass, Shirabe sends `backend_release` to this repository with the exact production commit SHA.

`npm-release.yml` fetches that commit's bundled contract, imports it, verifies both packages, and commits the generated SDK and version changes to `main`. It tags the verified package source, publishes the API first, waits for its npm availability, then publishes the card. It verifies the registry packages and records the GitHub releases. Both packages use the existing npm trusted publishers for `npm-release.yml`.

Already-published versions are skipped. A retry after partial publication keeps the same versions and finishes the missing package or release record. A same-version contract change or older spec version fails rather than silently publishing an inconsistent SDK. API releases must include a stable, increasing `info.version`; this workflow does not infer semver from the diff.

To retry a failed dispatch or SDK release, use the SHA from the successful Shirabe production run:

```sh
gh workflow run npm-release.yml --repo lostcoords/shirabe-sdk --ref main \
  -f backend_sha=<full-production-commit-sha>
```

This replaces the daily polling/PR workflow. `script/update-openapi` remains available for local contract development.

### One-time setup

Before enabling the production sender, install this receiver on `shirabe-sdk`'s default branch. Create two fine-grained tokens in GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, with resource owner `lostcoords`:

- **Dispatch token:** select only `shirabe-sdk`, grant **Contents: read and write**, and store it as `SDK_REPO_DISPATCH_TOKEN` in `lostcoords/shirabe`.
- **Source token:** select only `shirabe`, grant **Contents: read-only**, and store it as `SHIRABE_SOURCE_TOKEN` in `lostcoords/shirabe-sdk`. Shirabe is private, so the receiver fetches the pinned bundle through the authenticated GitHub Contents API.

Upload each token through the CLI's interactive prompt, not a command-line argument or chat:

```sh
gh secret set SDK_REPO_DISPATCH_TOKEN --repo lostcoords/shirabe
gh secret set SHIRABE_SOURCE_TOKEN --repo lostcoords/shirabe-sdk
```

The ordinary repository `GITHUB_TOKEN` cannot access another private repository or dispatch across repositories. Complete any organization approval for the tokens and renew them before expiry. `gh` can upload secrets but cannot create these fine-grained tokens.

The receiver needs Actions to push generated changes and tags. Its job requests `contents: write`; any branch rules must allow that bot update. Release jobs share one concurrency group so API/card publication and manual releases cannot race. Consumer projects keep their existing pinned dependencies until explicitly updated. Shirabe permits a newer service contract only while it remains compatible with its pinned SDK. Coordinate the consumer migration before deploying breaking API changes.

### Independent package releases

For SDK-only changes, bump the selected package version and publish a GitHub release tagged `api-v<version>` or `card-v<version>`. The release workflow checks that the tag matches the selected package manifest, verifies both package archives from a clean consumer, and publishes through npm trusted publishing. Publish an API dependency before releasing the card.

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
