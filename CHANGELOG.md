# Changelog

## Unreleased

- Publish API and card SDK releases from a verified Shirabe production commit when its OpenAPI version increases. Backend dispatch replaces daily spec polling; manual package releases remain available.
- Reject contract edits without an API version bump, wait for the API dependency before publishing the card, and resume partially completed releases without bumping versions again.
