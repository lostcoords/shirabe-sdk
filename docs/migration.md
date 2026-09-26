# SDK source migration outline

The SDK source and releases currently live in the private Shirabe application repository. Move them only after the public build and verification path is ready.

1. Publish a reviewed copy of the OpenAPI contract here, with a repeatable sync from the service repository. Keep API client code generation and drift checks beside the contract.
2. Move `packages/api` and `packages/card`, their tests, build scripts, examples, and package verification into this repository. Preserve package names, exports, and independently managed versions.
3. Move npm trusted publishing to this repository. Keep separate `api-v<version>` and `card-v<version>` releases. Verify both packed packages as clean consumers and require the card's API dependency version to already be published.
4. Update the Shirabe app and extension, plus Nadeshiko consumers, to use the new source location for local development. Run integration checks against locally linked packages before changing the release source of truth.
5. Update npm package repository metadata and documentation once releases come from here. Remove the old release workflow only after a successful release from this repository.

Until then, the existing Shirabe repository remains the source of truth for SDK source and releases.
