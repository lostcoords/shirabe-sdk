import { createShirabeClient } from "./client.js";
import type { ShirabeClientConfig } from "./client.js";
import { oauthToken } from "./generated/sdk.gen.js";
import type { ShirabeScope } from "./scopes.js";

export type ShirabeServiceScope = Exclude<ShirabeScope, `user:${string}`>;

export interface ShirabeServiceConfig extends Omit<ShirabeClientConfig, "accessToken"> {
  clientId: string;
  clientSecret: string;
  scope: ShirabeServiceScope;
}

export class ShirabeServiceAuthError extends Error {
  constructor(readonly status: number | null, readonly detail: unknown) {
    super(`Could not obtain a Shirabe service token${status ? ` (${status})` : ""}`);
    this.name = "ShirabeServiceAuthError";
  }
}

/** A server-side client-credentials connection with shared early renewal. */
export function createShirabeService(config: ShirabeServiceConfig) {
  if (!config.clientId || !config.clientSecret) throw new Error("Shirabe service client credentials are required");
  const { clientId, clientSecret, scope, ...clientOptions } = config;
  const baseUrl = (clientOptions.baseUrl ?? "https://shirabe.org").replace(/\/$/, "");
  const tokenClient = createShirabeClient({ baseUrl, fetch: clientOptions.fetch, headers: clientOptions.headers });
  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;
  let generation = 0;

  async function requestToken(requestGeneration: number): Promise<string> {
    const result = await oauthToken({
      client: tokenClient,
      headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` },
      body: { grant_type: "client_credentials", resource: `${baseUrl}/api/v1` },
    });
    if (result.error || !result.data) {
      throw new ShirabeServiceAuthError(result.response?.status ?? null, result.error);
    }
    if (!result.data.scope.split(/\s+/).includes(scope)) {
      throw new ShirabeServiceAuthError(result.response?.status ?? null, {
        message: `Shirabe service client was not granted ${scope}`,
        scope: result.data.scope,
      });
    }
    const lifetimeMs = result.data.expires_in * 1000;
    if (!result.data.access_token || !Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
      throw new ShirabeServiceAuthError(result.response?.status ?? null, { message: "Shirabe returned an invalid service token" });
    }
    if (requestGeneration !== generation) throw new Error("Shirabe service credentials were cleared during token request");
    cached = {
      token: result.data.access_token,
      expiresAt: Date.now() + lifetimeMs - Math.min(60_000, lifetimeMs * 0.1),
    };
    return cached.token;
  }

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now()) return cached.token;
    if (!pending) {
      const request = requestToken(generation);
      const inFlight = request.finally(() => { if (pending === inFlight) pending = null; });
      pending = inFlight;
    }
    return pending;
  }

  async function credential(): Promise<{ token: string; expiresAt: number }> {
    const token = await accessToken();
    if (!cached || cached.token !== token) throw new Error("Shirabe service credential cache was not populated");
    return { token, expiresAt: cached.expiresAt };
  }

  return {
    accessToken,
    credential,
    client: () => createShirabeClient({ ...clientOptions, baseUrl, accessToken }),
    /** Clears the local cache after credential rotation or in tests. */
    clear: () => { generation++; cached = null; pending = null; },
  };
}
