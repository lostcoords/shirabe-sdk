import { createShirabeOAuth, ShirabeOAuthError } from "./oauth.js";
import { createShirabeService, ShirabeServiceAuthError } from "./service.js";
import { type ShirabeScope } from "./scopes.js";
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
export declare function createShirabeClient(config: ShirabeServerConfig & {
    link: NonNullable<ShirabeServerConfig["link"]>;
}): ServerClient & {
    link: Link;
};
export declare function createShirabeClient(config: ShirabeServerConfig): ServerClient;
//# sourceMappingURL=server.d.ts.map