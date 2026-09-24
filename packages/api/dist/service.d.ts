import type { ShirabeClientConfig } from "./client.js";
import type { ShirabeScope } from "./scopes.js";
export type ShirabeServiceScope = Exclude<ShirabeScope, `user:${string}`>;
export interface ShirabeServiceConfig extends Omit<ShirabeClientConfig, "accessToken"> {
    clientId: string;
    clientSecret: string;
    scope: ShirabeServiceScope;
}
export declare class ShirabeServiceAuthError extends Error {
    readonly status: number | null;
    readonly detail: unknown;
    constructor(status: number | null, detail: unknown);
}
/** A server-side client-credentials connection with shared early renewal. */
export declare function createShirabeService(config: ShirabeServiceConfig): {
    accessToken: () => Promise<string>;
    credential: () => Promise<{
        token: string;
        expiresAt: number;
        refreshAt: number;
    }>;
    client: () => import("./client.js").ShirabeClient;
    /** Clears the local cache and forces the next call to request a new token. */
    clear: () => void;
};
//# sourceMappingURL=service.d.ts.map