import { createShirabeClient } from "./client.js";
export class ShirabePublicApiError extends Error {
    status;
    code;
    constructor(message, status, code) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export class ShirabePublicClient {
    renewing = null;
    retryAt = 0;
    generation = 0;
    config;
    constructor(config) {
        this.config = { ...config, credentials: config.credentials ?? emptyCredentials() };
    }
    update(baseUrl, credentials) {
        if (baseUrl !== this.config.baseUrl || credentials.refreshToken !== this.config.credentials.refreshToken ||
            credentials.accessToken !== this.config.credentials.accessToken) {
            this.generation++;
            this.retryAt = 0;
        }
        this.config = { ...this.config, baseUrl, credentials };
    }
    async begin(redirectUri) {
        const verifier = randomToken(32);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
        const challenge = base64url(new Uint8Array(digest));
        const state = randomToken(16);
        const base = this.baseUrl();
        const query = new URLSearchParams({
            response_type: "code",
            client_id: this.config.clientId,
            redirect_uri: redirectUri,
            scope: this.config.scopes.join(" "),
            state,
            code_challenge: challenge,
            code_challenge_method: "S256",
            resource: `${base}/api/v1`,
        });
        return { url: `${base}/oauth/authorize?${query}`, redirectUri, state, verifier };
    }
    async complete(callbackUrl, flow) {
        const callback = new URL(callbackUrl);
        const expected = new URL(flow.redirectUri);
        if (callback.origin !== expected.origin || callback.pathname !== expected.pathname) {
            throw new ShirabePublicApiError("Sign-in returned to an unexpected address.", 400);
        }
        const error = callback.searchParams.get("error");
        if (error)
            throw new ShirabePublicApiError(error === "access_denied" ? "You denied the request." : `Sign-in failed (${error}).`, 400, error);
        if (callback.searchParams.get("state") !== flow.state) {
            throw new ShirabePublicApiError("Sign-in was interrupted: please try again.", 400);
        }
        const code = callback.searchParams.get("code");
        if (!code)
            throw new ShirabePublicApiError("No authorization code was returned.", 400);
        const response = await this.request((client) => client.oauthToken({
            grant_type: "authorization_code",
            client_id: this.config.clientId,
            code,
            code_verifier: flow.verifier,
            redirect_uri: flow.redirectUri,
            resource: `${this.baseUrl()}/api/v1`,
        }), false);
        const credentials = credentialsFrom(response);
        this.config = { ...this.config, credentials };
        this.retryAt = 0;
        return credentials;
    }
    renew() {
        this.renewing ??= this.doRenew().finally(() => { this.renewing = null; });
        return this.renewing;
    }
    async doRenew() {
        const generation = this.generation;
        const refreshToken = this.config.credentials.refreshToken;
        if (!refreshToken)
            throw new ShirabePublicApiError("Not connected to Shirabe.", 401);
        let response;
        try {
            response = await this.request((client) => client.oauthToken({
                grant_type: "refresh_token",
                client_id: this.config.clientId,
                refresh_token: refreshToken,
                resource: `${this.baseUrl()}/api/v1`,
            }), false);
        }
        catch (error) {
            if (generation !== this.generation)
                throw new ShirabePublicApiError("Shirabe connection changed during renewal.", 409);
            if (error instanceof ShirabePublicApiError && error.code?.toLowerCase() === "invalid_grant") {
                this.config = { ...this.config, credentials: emptyCredentials() };
                await this.config.onSignedOut?.();
                throw new ShirabePublicApiError("Your Shirabe connection has expired. Connect again.", 401, "INVALID_GRANT");
            }
            throw error;
        }
        if (generation !== this.generation)
            throw new ShirabePublicApiError("Shirabe connection changed during renewal.", 409);
        const credentials = credentialsFrom(response);
        this.config = { ...this.config, credentials };
        this.retryAt = 0;
        await this.config.onCredentials?.(credentials);
    }
    async revoke() {
        const token = this.config.credentials.refreshToken || this.config.credentials.accessToken;
        if (!token)
            return;
        try {
            await this.request((client) => client.oauthRevoke({ token, client_id: this.config.clientId }), false);
        }
        catch {
            return;
        }
    }
    async authorization() {
        if (!this.config.credentials.refreshToken)
            throw new ShirabePublicApiError("Not connected to Shirabe.", 401);
        await this.ensureFreshToken();
        return `Bearer ${this.config.credentials.accessToken}`;
    }
    async request(call, authenticated = true, retried = false) {
        if (authenticated) {
            if (!this.config.credentials.refreshToken)
                throw new ShirabePublicApiError("Not connected to Shirabe.", 401);
            await this.ensureFreshToken();
        }
        const client = createShirabeClient({
            baseUrl: this.baseUrl(),
            accessToken: authenticated ? this.config.credentials.accessToken : undefined,
        });
        const result = await call(client);
        if (authenticated && result.response?.status === 401 && !retried) {
            await this.renew();
            return this.request(call, true, true);
        }
        if (result.error || !result.response?.ok) {
            const detail = result.error;
            throw new ShirabePublicApiError(detail?.detail || detail?.error_description || detail?.title || `Request failed (${result.response?.status ?? 0})`, result.response?.status ?? 0, detail?.code ?? detail?.error);
        }
        return result.data;
    }
    async ensureFreshToken() {
        const originalAccess = this.config.credentials.accessToken;
        const expiresAt = Date.parse(this.config.credentials.accessTokenExpiresAt);
        const refreshAt = Date.parse(this.config.credentials.accessTokenRefreshAt ?? "") || expiresAt - 60_000;
        const now = Date.now();
        if (this.config.credentials.accessToken && now < expiresAt && (now < refreshAt || now < this.retryAt))
            return;
        try {
            await this.renew();
        }
        catch (error) {
            if (error instanceof ShirabePublicApiError && error.status > 0 && error.status < 500 && error.status !== 429)
                throw error;
            if (!this.config.credentials.accessToken || this.config.credentials.accessToken !== originalAccess || expiresAt <= Date.now())
                throw error;
            this.retryAt = Date.now() + 5 * 60_000;
        }
    }
    baseUrl() {
        return this.config.baseUrl.replace(/\/$/, "");
    }
}
function credentialsFrom(response) {
    if (!response.refresh_token)
        throw new ShirabePublicApiError("Shirabe did not return a refresh token.", 502);
    const issuedAt = Date.now();
    const lifetimeMs = response.expires_in * 1000;
    return {
        accessToken: response.access_token,
        accessTokenExpiresAt: new Date(issuedAt + lifetimeMs).toISOString(),
        accessTokenRefreshAt: new Date(issuedAt + lifetimeMs * 0.7).toISOString(),
        refreshToken: response.refresh_token,
        scopes: response.scope.split(" ").filter(Boolean),
    };
}
function emptyCredentials() {
    return { accessToken: "", accessTokenExpiresAt: "", accessTokenRefreshAt: "", refreshToken: "", scopes: [] };
}
function randomToken(bytes) {
    return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}
function base64url(bytes) {
    let binary = "";
    for (const byte of bytes)
        binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
//# sourceMappingURL=public-oauth.js.map