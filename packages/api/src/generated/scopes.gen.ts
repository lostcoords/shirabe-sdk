// Generated from the OAuth security scheme in openapi/shirabe.bundled.yaml.
export const SHIRABE_SCOPES = [
  "user:dictionary:read",
  "user:profile:read",
  "user:preferences:read",
  "user:preferences:write",
  "user:dictionaries:read",
  "user:dictionaries:write",
  "user:study:read",
  "user:study:write",
  "dictionary:read",
] as const;
export type ShirabeScope = (typeof SHIRABE_SCOPES)[number];
