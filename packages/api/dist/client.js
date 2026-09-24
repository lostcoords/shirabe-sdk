import { createClient, createConfig, } from "./generated/client/index.js";
import { bindOperations } from "./generated/bound.gen.js";
export function createShirabeClient(config = {}) {
    const { accessToken, ...options } = config;
    const baseUrl = (options.baseUrl ?? "https://shirabe.org").replace(/\/$/, "");
    const client = createClient(createConfig({
        ...options,
        baseUrl,
        auth: accessToken,
    }));
    return Object.assign(client, bindOperations(client), {
        asUser: (readerToken) => createShirabeClient({ ...options, baseUrl, accessToken: readerToken }),
    });
}
//# sourceMappingURL=client.js.map