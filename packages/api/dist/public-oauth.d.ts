import { type ShirabeClient } from "./client.js";
import type { ShirabeScope } from "./scopes.js";
export declare class ShirabePublicApiError extends Error {
    readonly status: number;
    readonly code?: string | undefined;
    constructor(message: string, status: number, code?: string | undefined);
}
export type PublicCredentials = {
    accessToken: string;
    accessTokenExpiresAt: string;
    accessTokenRefreshAt?: string;
    refreshToken: string;
    scopes: string[];
};
export type PublicAuthorization = {
    url: string;
    redirectUri: string;
    state: string;
    verifier: string;
};
type ApiResult<T> = {
    data?: T;
    error?: unknown;
    response?: Response;
};
export type ShirabePublicClientConfig = {
    baseUrl: string;
    clientId: string;
    scopes: readonly ShirabeScope[];
    credentials?: PublicCredentials;
    onCredentials?: (credentials: PublicCredentials) => Promise<void>;
    onSignedOut?: () => Promise<void>;
};
export declare class ShirabePublicClient {
    private renewing;
    private retryAt;
    private generation;
    private config;
    constructor(config: ShirabePublicClientConfig);
    update(baseUrl: string, credentials: PublicCredentials): void;
    begin(redirectUri: string): Promise<PublicAuthorization>;
    complete(callbackUrl: string, flow: PublicAuthorization): Promise<PublicCredentials>;
    renew(): Promise<void>;
    private doRenew;
    revoke(): Promise<void>;
    authorization(): Promise<string>;
    request<T>(call: (client: ShirabeClient) => Promise<ApiResult<T>>, authenticated?: boolean, retried?: boolean): Promise<T>;
    private ensureFreshToken;
    private baseUrl;
}
export {};
//# sourceMappingURL=public-oauth.d.ts.map