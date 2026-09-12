import { type Client, type Config } from "./generated/client/index.js";
export type AccessToken = string | (() => string | undefined | Promise<string | undefined>);
export interface ShirabeClientConfig extends Omit<Config, "auth"> {
    accessToken?: AccessToken;
}
export declare function createShirabeClient(config?: ShirabeClientConfig): Client;
//# sourceMappingURL=client.d.ts.map