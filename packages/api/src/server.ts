import { createShirabeOAuth, ShirabeOAuthError } from "./oauth.js";
import { createShirabeService, ShirabeServiceAuthError } from "./service.js";
import { SHIRABE_SCOPES, type ShirabeScope } from "./scopes.js";
import type { ShirabeClientConfig } from "./client.js";

export { ShirabeOAuthError, ShirabeServiceAuthError };
export type { ShirabeScope } from "./scopes.js";

export interface ShirabeServerConfig extends Omit<ShirabeClientConfig, "accessToken"> {
  clientId: string;
  clientSecret: string;
  scopes: readonly ShirabeScope[];
  link?: {
    redirectUri: string;
    stateSecret: string;
    previousStateSecret?: string;
    userAgent?: string;
  };
}

type Link = ReturnType<typeof createShirabeOAuth>;
type Service = ReturnType<typeof createShirabeService>;
type ServerClient = ReturnType<Service["client"]> & {
  getAccessToken: Service["accessToken"];
  getCredential: Service["credential"];
  clearCredentials: Service["clear"];
};

export function createShirabeClient(config: ShirabeServerConfig & { link: NonNullable<ShirabeServerConfig["link"]> }): ServerClient & { link: Link };
export function createShirabeClient(config: ShirabeServerConfig): ServerClient;
export function createShirabeClient(config: ShirabeServerConfig): ServerClient & { link?: Link } {
  const unknown = config.scopes.filter((scope) => !SHIRABE_SCOPES.includes(scope));
  if (unknown.length) throw new Error(`Unknown Shirabe scopes: ${unknown.join(", ")}`);
  if (!config.scopes.includes("dictionary:read")) throw new Error("Service calls require dictionary:read");
  const { clientId, clientSecret, scopes, link: linkConfig, ...clientOptions } = config;
  const userScopes = scopes.filter((scope): scope is Extract<ShirabeScope, `user:${string}`> => scope.startsWith("user:"));
  if (linkConfig && !userScopes.length) throw new Error("Reader linking requires at least one user scope");
  const service = createShirabeService({
    ...clientOptions,
    clientId,
    clientSecret,
    scope: "dictionary:read",
  });
  const link = linkConfig ? createShirabeOAuth({
    baseUrl: clientOptions.baseUrl,
    fetch: clientOptions.fetch,
    clientId,
    clientSecret,
    redirectUri: linkConfig.redirectUri,
    stateSecret: linkConfig.stateSecret,
    previousStateSecret: linkConfig.previousStateSecret,
    userAgent: linkConfig.userAgent,
    scopes: userScopes,
  }) : undefined;
  return Object.assign(service.client(), {
    getAccessToken: service.accessToken,
    getCredential: service.credential,
    clearCredentials: service.clear,
    ...(link ? { link } : {}),
  });
}
