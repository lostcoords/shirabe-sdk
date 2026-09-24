import { type Client, type Config } from "./generated/client/index.js";
import { type BoundOperations } from "./generated/bound.gen.js";
export type AccessToken = string | (() => string | undefined | Promise<string | undefined>);
export interface ShirabeClientConfig extends Omit<Config, "auth"> {
    accessToken?: AccessToken;
}
export type ShirabeClient = Client & BoundOperations & {
    asUser(accessToken: AccessToken): ShirabeClient;
};
export declare function createShirabeClient(config?: ShirabeClientConfig): ShirabeClient;
//# sourceMappingURL=client.d.ts.map