import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createShirabeClient } from "./client.js";
import { oauthRevoke, oauthToken } from "./generated/sdk.gen.js";
import type { OauthTokenResponse } from "./generated/types.gen.js";

export const SHIRABE_USER_SCOPES = [
  "user:dictionary:read",
  "user:profile:read",
  "user:preferences:read",
  "user:preferences:write",
  "user:dictionaries:read",
  "user:dictionaries:write",
  "user:study:read",
  "user:study:write",
] as const;

export type ShirabeUserScope = (typeof SHIRABE_USER_SCOPES)[number];

type Flow = { subject: string; verifier: string; expiresAt: number };

export interface ShirabeOAuthConfig {
  baseUrl?: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  stateSecret: string;
  previousStateSecret?: string;
  scopes: readonly ShirabeUserScope[];
  fetch?: typeof fetch;
  userAgent?: string;
}

export class ShirabeOAuthError extends Error {
  constructor(readonly code: string, readonly status?: number, readonly detail?: unknown) {
    super(`Shirabe OAuth request failed: ${code}`);
    this.name = "ShirabeOAuthError";
  }
}

const FLOW_TTL_MS = 15 * 60 * 1000;

function stateKey(secret: string): Buffer {
  return createHash("sha256").update("shirabe.oauth-state\0").update(secret).digest();
}

function seal(flow: Flow, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", stateKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(flow)), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
}

function open(state: string, secrets: string[]): Flow {
  const [version, encodedIv, encodedText, encodedTag] = state.split(".");
  if (version !== "v1" || !encodedIv || !encodedText || !encodedTag) {
    throw new ShirabeOAuthError("invalid_state");
  }
  for (const secret of secrets) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", stateKey(secret), Buffer.from(encodedIv, "base64url"));
      decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
      return JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(encodedText, "base64url")),
        decipher.final(),
      ]).toString()) as Flow;
    } catch {
      continue;
    }
  }
  throw new ShirabeOAuthError("invalid_state");
}

export function createShirabeOAuth(config: ShirabeOAuthConfig) {
  if (config.stateSecret.length < 32) throw new Error("stateSecret must have at least 32 characters");
  const baseUrl = (config.baseUrl ?? "https://shirabe.org").replace(/\/$/, "");
  const resource = `${baseUrl}/api/v1`;
  const client = createShirabeClient({
    baseUrl,
    fetch: config.fetch,
    headers: config.userAgent ? { "user-agent": config.userAgent } : undefined,
  });
  const credentials = { client_id: config.clientId, client_secret: config.clientSecret };

  async function requestToken(body: Parameters<typeof oauthToken>[0]["body"], signal?: AbortSignal): Promise<OauthTokenResponse> {
    const result = await oauthToken({ client, body: { ...body, resource, ...credentials }, signal });
    if (result.error || !result.data) {
      const detail = result.error as { error?: string } | undefined;
      throw new ShirabeOAuthError(detail?.error ?? "token_request_failed", result.response?.status, result.error);
    }
    return result.data;
  }

  return {
    begin(subject: string) {
      if (!subject) throw new Error("subject is required");
      const verifier = randomBytes(48).toString("base64url");
      const state = seal({ subject, verifier, expiresAt: Date.now() + FLOW_TTL_MS }, config.stateSecret);
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      const url = new URL("/oauth/authorize", baseUrl);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        resource,
        scope: config.scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      }).toString();
      return { authorizeUrl: url.toString(), state };
    },

    async complete(input: { code: string; state: string; subject: string; issuer?: string; signal?: AbortSignal }) {
      const flow = open(input.state, [config.stateSecret, config.previousStateSecret].filter((value): value is string => !!value));
      if (!flow.subject || !flow.verifier) throw new ShirabeOAuthError("invalid_state");
      if (flow.expiresAt < Date.now()) throw new ShirabeOAuthError("state_expired");
      if (flow.subject !== input.subject) throw new ShirabeOAuthError("subject_mismatch");
      if (input.issuer && input.issuer !== baseUrl) throw new ShirabeOAuthError("invalid_issuer");
      return requestToken({
        grant_type: "authorization_code",
        code: input.code,
        code_verifier: flow.verifier,
        redirect_uri: config.redirectUri,
      }, input.signal);
    },

    refresh(refreshToken: string, signal?: AbortSignal) {
      return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken }, signal);
    },

    async revoke(refreshToken: string, signal?: AbortSignal) {
      const result = await oauthRevoke({
        client,
        body: { token: refreshToken, ...credentials },
        signal,
      });
      if (result.error) {
        const detail = result.error as { error?: string } | undefined;
        throw new ShirabeOAuthError(detail?.error ?? "revoke_failed", result.response?.status, result.error);
      }
    },
  };
}
