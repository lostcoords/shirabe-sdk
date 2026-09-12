import {
  createClient,
  createConfig,
  type Client,
  type Config,
} from "./generated/client/index.js";

export type AccessToken = string | (() => string | undefined | Promise<string | undefined>);

export interface ShirabeClientConfig extends Omit<Config, "auth"> {
  accessToken?: AccessToken;
}

export function createShirabeClient(config: ShirabeClientConfig = {}): Client {
  const { accessToken, ...options } = config;
  const baseUrl = (options.baseUrl ?? "https://shirabe.org").replace(/\/$/, "");

  return createClient(createConfig({
    ...options,
    baseUrl,
    auth: accessToken,
  }));
}
