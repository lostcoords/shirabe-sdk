# SDK source migration outline

The SDK source and releases currently live in the private Shirabe application repository. Move them only after the public build and verification path is ready.

1. Publish a reviewed copy of the OpenAPI contract here, with a repeatable sync from the service repository. Keep API client code generation and drift checks beside the contract.
2. Move `packages/api` and `packages/card`, their tests, build scripts, examples, and package verification into a private npm workspace root. Preserve package names, exports, and independently managed base versions. Keep the card's dependency on an exact API version.
3. A push to `main` builds, tests, and publishes each package's dev version, derived from its own base version, UTC date, and commit SHA (for example `0.6.2-dev.20260926.shaabcdef1`). Publish dev builds with npm's `dev` dist-tag. A dev card must depend on the API dev build from the same commit, published first.
4. Publish stable versions from separate `api-v<version>` and `card-v<version>` tags. Require each tag to match that package's manifest version. Publish with the `latest` dist-tag only after package checks pass. A stable card release requires its exact stable API dependency to be available on npm; an API release does not require a card release.
5. Configure npm trusted publishing for **both** existing packages to allow publishing from this repository's dev and stable workflows. Use GitHub-hosted Actions runners with OIDC, update both package repository URLs, and verify the published tarballs. Add the new trusted publishers while the Shirabe workflow still works; retire the old publishers only after publishing succeeds here.
6. Update the Shirabe app and extension, plus Nadeshiko consumers, to use the new source location for local development. Run integration checks against locally linked packages before changing the release source of truth. Remove the old release workflow after a successful release from this repository.

Until then, the existing Shirabe repository remains the source of truth for SDK source and releases.
