import { createShirabeOAuth, ShirabeOAuthError } from "./oauth.js";
import { createShirabeService, ShirabeServiceAuthError } from "./service.js";
import { SHIRABE_SCOPES } from "./scopes.js";
export { ShirabeOAuthError, ShirabeServiceAuthError };
export function createShirabeClient(config) {
    const unknown = config.scopes.filter((scope) => !SHIRABE_SCOPES.includes(scope));
    if (unknown.length)
        throw new Error(`Unknown Shirabe scopes: ${unknown.join(", ")}`);
    if (!config.scopes.includes("dictionary:read"))
        throw new Error("Service calls require dictionary:read");
    const { clientId, clientSecret, scopes, link: linkConfig, ...clientOptions } = config;
    const userScopes = scopes.filter((scope) => scope.startsWith("user:"));
    if (linkConfig && !userScopes.length)
        throw new Error("Reader linking requires at least one user scope");
    const service = createShirabeService({
        ...clientOptions,
        clientId,
        clientSecret,
        scope: "dictionary:read",
    });
    const link = linkConfig ? createShirabeOAuth({
        baseUrl: clientOptions.baseUrl,
        fetch: clientOptions.fetch,
        clientId,
        clientSecret,
        redirectUri: linkConfig.redirectUri,
        stateSecret: linkConfig.stateSecret,
        previousStateSecret: linkConfig.previousStateSecret,
        userAgent: linkConfig.userAgent,
        scopes: userScopes,
    }) : undefined;
    return Object.assign(service.client(), {
        getAccessToken: service.accessToken,
        getCredential: service.credential,
        clearCredentials: service.clear,
        ...(link ? { link } : {}),
    });
}
//# sourceMappingURL=server.js.map