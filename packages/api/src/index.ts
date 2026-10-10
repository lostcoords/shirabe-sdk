export * from "./generated/index.js";
export { client } from "./generated/client.gen.js";
export type { Client, Config } from "./generated/client/index.js";
export { SHIRABE_SCOPES, type ShirabeScope } from "./scopes.js";
export {
  createShirabeClient,
  type AccessToken,
  type ShirabeClient,
  type ShirabeClientConfig,
} from "./client.js";
export { ShirabePublicClient, ShirabePublicApiError } from "./public-oauth.js";
export type { PublicAuthorization, PublicCredentials, ShirabePublicClientConfig } from "./public-oauth.js";
