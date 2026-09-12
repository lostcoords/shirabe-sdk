import { createClient, createConfig, } from "./generated/client/index.js";
export function createShirabeClient(config = {}) {
    const { accessToken, ...options } = config;
    const baseUrl = (options.baseUrl ?? "https://shirabe.org").replace(/\/$/, "");
    return createClient(createConfig({
        ...options,
        baseUrl,
        auth: accessToken,
    }));
}
//# sourceMappingURL=client.js.map