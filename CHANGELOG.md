# Changelog

## Unreleased

- Publish API and card SDK releases from a verified Shirabe production commit when its OpenAPI version increases. Backend dispatch replaces daily spec polling; manual package releases remain available.
- Reject contract edits without an API version bump, wait for the API dependency before publishing the card, and resume partially completed releases without bumping versions again.

## Card 0.1.3

- Keep raw-text lookups hidden until the matched headword is known, instead of showing the full sentence while loading.
- Keep dictionary results in one continuous scroll area without resizing the popup on wheel input.
- Match Shirabe's default light and dark theme colors.
