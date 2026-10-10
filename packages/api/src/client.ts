import {
  createClient,
  createConfig,
  type Client,
  type Config,
} from "./generated/client/index.js";
import { bindOperations, type BoundOperations } from "./generated/bound.gen.js";

export type AccessToken = string | (() => string | undefined | Promise<string | undefined>);

export interface ShirabeClientConfig extends Omit<Config, "auth"> {
  accessToken?: AccessToken;
}

export type ShirabeClient = Client & BoundOperations & {
  asUser(accessToken: AccessToken): ShirabeClient;
};

export function createShirabeClient(config: ShirabeClientConfig = {}): ShirabeClient {
  const { accessToken, ...options } = config;
  const baseUrl = (options.baseUrl ?? "https://shirabe.org").replace(/\/$/, "");

  const client = createClient(createConfig({
    ...options,
    baseUrl,
    auth: accessToken,
  }));
  return Object.assign(client, bindOperations(client), {
    asUser: (readerToken: AccessToken) => createShirabeClient({ ...options, baseUrl, accessToken: readerToken }),
  });
}
