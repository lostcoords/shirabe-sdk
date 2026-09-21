import type {
  OauthDeviceAuthorizationData,
  OauthDeviceAuthorizationError,
  OauthDeviceAuthorizationResponse,
  OauthTokenData,
  OauthTokenError,
  OauthTokenResponse2,
} from "@shirabe-org/api";

/** Device-flow sign-in for card WebViews and Desktop.
 * Anki's card client uses user:dictionary:read, user:study:read and user:profile:read, including
 * personal dictionaries, study state and account preferences. Other deck
 * scripts can read WebView localStorage and reuse its tokens to read those
 * records. These grants do not permit study or account changes. */

export type LinkOptions = {
  apiBase: string;
  /** A public client with read-only scopes. Nothing else belongs on a card. */
  clientId: string;
  scope?: string;
  /** Swappable for a test; `localStorage` in a browser. A webview in private
      mode throws on access rather than returning null, so this is also where
      "there is no storage" is absorbed. */
  storage?: Storage;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
};

type Stored = { access: string; refresh?: string; expiresAt: number };
type Progress = (message: string | Node) => void;
type SignInAttempt = { promise: Promise<void>; listeners: Set<Progress>; message?: string | Node };

/** A device authorization the reader has been sent away to approve. */
type Pending = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expiresAt: number;
};

const KEY = "shirabe.link";

// The code outlives the promise that was waiting on it, ON PURPOSE. This flow
// asks the reader to LEAVE: on a phone they tap through to a browser, approve,
// and come back to an Anki that may have suspended the webview and has certainly
// re-rendered the card. The poll is gone by then, and the approval they just
// gave is sitting on the server with nothing to collect it. Keeping the code
// means the next lookup redeems it instead of minting a second one and asking
// them to approve all over again.
const PENDING = "shirabe.pending";

// Renew a little before the hour is up: a token that expires between the check
// and the request is a lookup that fails for no reason the reader can see.
const RENEW_MARGIN_MS = 120_000;

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export type Link = {
  /** Wraps `fetch` so every request carries the reader, renewing the token when
      it has run out. Give this to `apiHost` instead of a `token`. */
  fetch: typeof globalThis.fetch;
  linked(): boolean;
  /** Runs the whole flow and resolves once the reader is signed in. Shaped to be
      handed straight to `WordCardHost.resolvePending`. */
  signIn(onProgress: (message: string | Node) => void): Promise<void>;
  /** Cancels pending authentication work and forgets this link's session. */
  signOut(): void;
};

export function createLink(options: LinkOptions): Link {
  const base = options.apiBase.replace(/\/$/, "");
  const resource = `${base}/api/v1`;
  const http = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? (() => Date.now());
  const store = safeStorage(options.storage);

  let held: Stored | null = read();
  let renewing: Promise<boolean> | null = null;
  let session = new AbortController();
  let signing: SignInAttempt | null = null;

  function read(): Stored | null {
    try {
      const raw = store?.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      // A session is an access token. Anything else that ends up in this slot
      // is not one, and reading it as a session is worse than reading nothing:
      // `linked()` goes true, so the card stops offering the sign-in, and every
      // request carries an undefined bearer that the server counts against the
      // unauthenticated rate limit until the reader gives up.
      if (!parsed || typeof (parsed as Stored).access !== "string") return null;
      return parsed as Stored;
    } catch {
      return null;
    }
  }

  function write(next: Stored | null): void {
    held = next;
    try {
      if (next) store?.setItem(KEY, JSON.stringify(next));
      else store?.removeItem(KEY);
    } catch {
      // A webview that refuses to store leaves the reader signed in for this
      // session only, which is better than refusing to sign them in at all.
    }
  }

  const post = async <T>(path: string, fields: unknown, signal: AbortSignal): Promise<T> => {
    signal.throwIfAborted();
    const response = await http(`${base}/api/v1${path}`, {
      signal,
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(fields),
    });
    const body = await response.json().catch(() => ({})) as T;
    signal.throwIfAborted();
    return body;
  };

  /** A code from an earlier attempt that is still worth trying. */
  function waiting(): Pending | null {
    try {
      const raw = store?.getItem(PENDING);
      const pending = raw ? JSON.parse(raw) as Pending : null;
      if (!pending) return null;
      if (pending.expiresAt <= now()) {
        remember(null);
        return null;
      }
      return pending;
    } catch {
      return null;
    }
  }

  function remember(pending: Pending | null): void {
    try {
      if (pending) store?.setItem(PENDING, JSON.stringify(pending));
      else store?.removeItem(PENDING);
    } catch {
      // Without storage the flow still works, it just cannot be resumed.
    }
  }

  /** One attempt at the token endpoint. True means signed in. */
  async function redeem(deviceCode: string, signal: AbortSignal): Promise<boolean> {
    const fields = {
      grant_type: DEVICE_GRANT,
      device_code: deviceCode,
      client_id: options.clientId,
      resource,
    } satisfies OauthTokenData["body"];
    const answer = await post<OauthTokenResponse2 | OauthTokenError>("/oauth/token", fields, signal);
    if (!("access_token" in answer)) return false;
    keep(answer);
    remember(null);
    return true;
  }

  function renew(): Promise<boolean> {
    if (renewing) return renewing;
    const pending = exchangeRefresh(session.signal).finally(() => {
      if (renewing === pending) renewing = null;
    });
    return renewing = pending;
  }

  async function exchangeRefresh(signal: AbortSignal): Promise<boolean> {
    if (!held?.refresh) return false;
    const fields = {
      grant_type: "refresh_token",
      refresh_token: held.refresh,
      client_id: options.clientId,
      resource,
    } satisfies OauthTokenData["body"];
    const answer = await post<OauthTokenResponse2 | OauthTokenError>("/oauth/token", fields, signal);
    if (!("access_token" in answer)) {
      if ("error" in answer && answer.error === "invalid_grant") {
        write(null);
        return false;
      }
      throw new Error("Shirabe couldn't renew your connection. Please try again.");
    }
    keep(answer);
    return true;
  }

  function keep(answer: OauthTokenResponse2): void {
    write({
      access: answer.access_token,
      refresh: answer.refresh_token ?? held?.refresh,
      expiresAt: now() + Number(answer.expires_in ?? 3600) * 1000,
    });
  }

  const authorized: typeof globalThis.fetch = async (input, init) => {
    const signal = session.signal;
    if (held && held.expiresAt - RENEW_MARGIN_MS < now()) await renew();
    signal.throwIfAborted();
    const send = (): Promise<Response> => http(input, {
      ...init,
      headers: { ...init?.headers, ...(held ? { Authorization: `Bearer ${held.access}` } : {}) },
    });

    const access = held?.access;
    const response = await send();
    signal.throwIfAborted();
    // A token the server rejects mid-session (revoked, or our clock was wrong
    // about the expiry) gets one renewal and one retry. Beyond that the 401 is
    // the answer, and the card turns it into a sign-in prompt.
    if (response.status !== 401 || !held?.refresh) return response;
    if (held.access !== access) return send();
    const renewed = await renew();
    signal.throwIfAborted();
    return renewed ? send() : response;
  };

  return {
    fetch: authorized,
    linked: () => !!held,
    signOut: () => {
      session.abort();
      session = new AbortController();
      signing = null;
      renewing = null;
      write(null);
      remember(null);
    },

    signIn(onProgress) {
      if (!signing) {
        const signal = session.signal;
        const attempt: SignInAttempt = { promise: Promise.resolve(), listeners: new Set() };
        attempt.promise = Promise.resolve().then(() => runSignIn((message) => {
          attempt.message = message;
          for (const listener of [...attempt.listeners]) {
            signal.throwIfAborted();
            listener(copyProgress(message));
          }
        }, signal)).finally(() => {
          attempt.listeners.clear();
          if (signing === attempt) signing = null;
        });
        signing = attempt;
      }
      const attempt = signing;
      attempt.listeners.add(onProgress);
      if (attempt.message !== undefined) onProgress(copyProgress(attempt.message));
      return attempt.promise;
    },
  };

  async function runSignIn(onProgress: Progress, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    let live = waiting();
    if (live && await redeem(live.device_code, signal)) return;

    if (!live) {
      const fields = {
        client_id: options.clientId,
        scope: options.scope ?? "user:dictionary:read user:study:read",
        resource,
      } satisfies OauthDeviceAuthorizationData["body"];
      const started = await post<OauthDeviceAuthorizationResponse | OauthDeviceAuthorizationError>(
        "/oauth/device_authorization", fields, signal,
      );
      if (!("device_code" in started)) {
        throw new Error(("error_description" in started && started.error_description) || "Shirabe could not start the sign-in.");
      }
      live = {
        device_code: started.device_code,
        user_code: started.user_code,
        verification_uri: started.verification_uri_complete || started.verification_uri,
        interval: Number(started.interval || 5),
        expiresAt: now() + Number(started.expires_in || 600) * 1000,
      };
      remember(live);
    }

    onProgress(prompt(live.verification_uri, live.user_code));

    // The server states the polling interval and RFC 8628 says to obey it,
    // including the `slow_down` that widens it: polling faster gets the whole
    // attempt rejected rather than answered sooner.
    let interval = live.interval * 1000;

    while (now() < live.expiresAt) {
      await sleep(interval, signal);
      const fields = {
        grant_type: DEVICE_GRANT,
        device_code: live.device_code,
        client_id: options.clientId,
        resource,
      } satisfies OauthTokenData["body"];
      const answer = await post<OauthTokenResponse2 | OauthTokenError>("/oauth/token", fields, signal);
      if ("access_token" in answer) {
        keep(answer);
        remember(null);
        return;
      }
      if (!("error" in answer)) throw new Error("The sign-in did not complete.");
      if (answer.error === "slow_down") interval += 5000;
      else if (answer.error !== "authorization_pending") {
        remember(null);
        throw new Error(answer.error === "access_denied"
          ? "Sign-in was declined."
          : answer.error_description || "The sign-in did not complete.");
      }
    }
    remember(null);
    throw new Error("The sign-in code expired. Tap the word again to get a new one.");
  }
}

function copyProgress(message: string | Node): string | Node {
  return typeof message === "string" ? message : message.cloneNode(true);
}

function prompt(url: string, code: string): Node {
  const wrap = document.createElement("div");
  wrap.className = "sb-link-prompt";

  const link = document.createElement("a");
  link.className = "sb-link-open";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "Sign in to Shirabe";

  const shown = document.createElement("span");
  shown.className = "sb-link-code";
  shown.textContent = code;

  const status = document.createElement("p");
  status.textContent = "Waiting for approval. Return here after connecting.";
  status.setAttribute("role", "status");
  wrap.append(link, status, document.createTextNode("Confirmation code: "), shown);
  const manual = document.createElement("details");
  manual.className = "sb-link-manual";
  const summary = document.createElement("summary");
  summary.textContent = "Copy sign-in link and code";
  const help = document.createElement("p");
  help.textContent = "If the sign-in link won't open, copy this address, open your browser yourself, and paste it there. Return here after approving.";
  manual.append(summary, help);
  for (const [name, value, rows] of [["Verification address", url, 2], ["Confirmation code", code, 1]] as const) {
    const label = document.createElement("label");
    const field = document.createElement("textarea");
    field.readOnly = true;
    field.spellcheck = false;
    field.rows = rows;
    field.textContent = value;
    label.append(name, field);
    manual.append(label);
  }
  wrap.append(manual);
  return wrap;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

// Reading `localStorage` THROWS rather than returning null where site data is
// blocked, so the guard is a try and not a null check.
function safeStorage(given?: Storage): Storage | null {
  if (given) return given;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
