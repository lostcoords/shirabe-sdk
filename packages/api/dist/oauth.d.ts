import type { OauthTokenResponse } from "./generated/types.gen.js";
export declare const SHIRABE_USER_SCOPES: readonly ["user:dictionary:read", "user:profile:read", "user:preferences:read", "user:preferences:write", "user:dictionaries:read", "user:dictionaries:write", "user:study:read", "user:study:write"];
export type ShirabeUserScope = (typeof SHIRABE_USER_SCOPES)[number];
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
export declare class ShirabeOAuthError extends Error {
    readonly code: string;
    readonly status?: number | undefined;
    readonly detail?: unknown | undefined;
    constructor(code: string, status?: number | undefined, detail?: unknown | undefined);
}
export declare function createShirabeOAuth(config: ShirabeOAuthConfig): {
    begin(subject: string): {
        authorizeUrl: string;
        state: string;
    };
    complete(input: {
        code: string;
        state: string;
        subject: string;
        issuer?: string;
        signal?: AbortSignal;
    }): Promise<OauthTokenResponse>;
    refresh(refreshToken: string, signal?: AbortSignal): Promise<OauthTokenResponse>;
    revoke(refreshToken: string, signal?: AbortSignal): Promise<void>;
};
//# sourceMappingURL=oauth.d.ts.map