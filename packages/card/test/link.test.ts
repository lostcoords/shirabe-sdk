import assert from "node:assert/strict";
import test from "node:test";
import { createLink } from "../src/word-card/link.js";
import { apiHost } from "../src/word-card/api-host.js";

// The sign-in prompt is a node the reader taps, so building it needs a document.
test.before(async () => {
  const { Window } = await import("happy-dom");
  const window = new Window({ url: "https://example.test/card" });
  Object.assign(globalThis, { window, document: window.document, Node: window.Node });
});

// A `localStorage` in a Map, so a test can watch what is kept as well as what
// is sent.
function memory(): Storage & { seen: Map<string, string> } {
  const seen = new Map<string, string>();
  return {
    seen,
    getItem: (k: string) => seen.get(k) ?? null,
    setItem: (k: string, v: string) => void seen.set(k, v),
    removeItem: (k: string) => void seen.delete(k),
    clear: () => seen.clear(),
    key: (i: number) => [...seen.keys()][i] ?? null,
    get length() { return seen.size; },
  } as Storage & { seen: Map<string, string> };
}

type Call = { url: string; body: Record<string, string> };

/** A server that answers the device flow, recording what it was asked. */
function server(script: Array<Record<string, unknown>>, calls: Call[] = []) {
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    const body = request.body ? await request.clone().json() as Record<string, string> : {};
    calls.push({ url, body });
    const next = script.shift() ?? { status: 404 };
    return new Response(JSON.stringify(next.body ?? {}), { status: (next.status as number) ?? 200 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const started = {
  body: {
    device_code: "dev-1", user_code: "FST7-4RZ3",
    verification_uri: "https://shirabe.org/link",
    verification_uri_complete: "https://shirabe.org/link?code=FST7-4RZ3",
    expires_in: 600, interval: 0,
  },
};

test("signing out during renewal rejects the old request without restoring its session", async () => {
  const store = memory();
  store.setItem("shirabe.link", JSON.stringify({ access: "old", refresh: "live", expiresAt: 0 }));
  let release!: (response: Response) => void;
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store,
    fetch: async (url) => (url instanceof Request ? url.url : String(url)).endsWith("/oauth/token") ? new Promise<Response>((resolve) => { release = resolve; }) : new Response("{}") });
  const request = link.fetch("https://shirabe.org/a");
  const rejected = assert.rejects(request, { name: "AbortError" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  link.signOut();
  release(new Response(JSON.stringify({ access_token: "late", expires_in: 3600 })));
  await rejected;
  assert.equal(link.linked(), false);
  assert.equal(store.getItem("shirabe.link"), null);
});

test("concurrent sign-ins share one authorization and give every caller the prompt", async () => {
  let starts = 0;
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: memory(),
    fetch: async (url) => {
      if ((url instanceof Request ? url.url : String(url)).endsWith("/device_authorization")) {
        starts++;
        return new Response(JSON.stringify({ ...started.body, interval: 0.001 }));
      }
      return new Response(JSON.stringify({ access_token: "live", expires_in: 3600 }));
    } });
  const prompts: Array<Node | string> = [];
  await Promise.all([link.signIn((value) => prompts.push(value)), link.signIn((value) => prompts.push(value))]);
  assert.equal(starts, 1);
  assert.equal(prompts.length, 2);
  assert.notEqual(prompts[0], prompts[1], "each caller owns its prompt node");
  assert.equal(link.linked(), true);
});

test("signing out while authorization starts cannot restore a pending code", async () => {
  const store = memory();
  let release!: (response: Response) => void;
  let requested!: () => void;
  const reached = new Promise<void>((resolve) => { requested = resolve; });
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store,
    fetch: async () => new Promise<Response>((resolve) => { release = resolve; requested(); }) });
  const signing = link.signIn(() => { throw new Error("A cancelled sign-in must not show progress"); });
  const rejected = assert.rejects(signing, { name: "AbortError" });
  await reached;
  link.signOut();
  release(new Response(JSON.stringify(started.body)));
  await rejected;
  assert.equal(store.getItem("shirabe.pending"), null);
});

test("a cancelled approval response cannot overwrite a subsequent sign-in", async () => {
  const store = memory();
  store.setItem("shirabe.pending", JSON.stringify({ device_code: "old", expiresAt: 9e15 }));
  let release!: (response: Response) => void;
  let requested!: () => void;
  const reached = new Promise<void>((resolve) => { requested = resolve; });
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store,
    fetch: async (url, init) => {
      const request = url instanceof Request ? url : new Request(url, init);
      if ((await request.clone().json() as { device_code?: string }).device_code === "old") {
        return new Promise<Response>((resolve) => { release = resolve; requested(); });
      }
      return new Response(JSON.stringify((url instanceof Request ? url.url : String(url)).endsWith("/device_authorization")
        ? { ...started.body, interval: 0.001 }
        : { access_token: "new-session", expires_in: 3600 }));
    } });
  const old = link.signIn(() => {});
  const rejected = assert.rejects(old, { name: "AbortError" });
  await reached;
  link.signOut();
  await link.signIn(() => {});
  release(new Response(JSON.stringify({ access_token: "old-session", expires_in: 3600 })));
  await rejected;
  assert.equal(JSON.parse(store.getItem("shirabe.link")!).access, "new-session");
});

test("signing out stops polling without waiting for its next interval", async () => {
  let polls = 0;
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: memory(),
    fetch: async (url) => {
      if ((url instanceof Request ? url.url : String(url)).endsWith("/oauth/token")) polls++;
      return new Response(JSON.stringify({ ...started.body, interval: 60 }));
    } });
  await assert.rejects(link.signIn(() => queueMicrotask(() => link.signOut())), { name: "AbortError" });
  assert.equal(polls, 0);
});

test("signing in polls until the reader approves, then keeps the token", async () => {
  const { fetch, calls } = server([
    started,
    { status: 400, body: { error: "authorization_pending" } },
    { body: { access_token: "shra_live", refresh_token: "shrr_live", expires_in: 3600 } },
  ]);
  const store = memory();
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "shirabe-anki-card", storage: store, fetch });

  let shown: Node | string | undefined;
  await link.signIn((message) => { shown = message; });

  assert.equal(link.linked(), true);
  assert.match(store.seen.get("shirabe.link")!, /shra_live/);
  assert.equal(calls[0].url, "https://shirabe.org/api/v1/oauth/device_authorization");
  assert.equal(calls[0].body.client_id, "shirabe-anki-card");
  assert.equal(calls[0].body.resource, "https://shirabe.org/api/v1");
  assert.equal(calls[2].body.grant_type, "urn:ietf:params:oauth:grant-type:device_code");
  assert.equal(calls[2].body.resource, "https://shirabe.org/api/v1");

  // The reader has to be able to LEAVE for a browser, so the prompt is a
  // target and not a sentence about one.
  const prompt = shown as HTMLElement;
  const anchor = prompt.querySelector("a")!;
  assert.equal(anchor.getAttribute("href"), "https://shirabe.org/link?code=FST7-4RZ3");
  assert.match(prompt.textContent!, /FST7-4RZ3/);
  assert.doesNotMatch(prompt.textContent!, /and enter/);
  assert.match(prompt.textContent!, /Waiting for approval/);
});

test("a declined sign-in says so instead of polling out the clock", async () => {
  const { fetch } = server([started, { status: 400, body: { error: "access_denied" } }]);
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: memory(), fetch });

  await assert.rejects(link.signIn(() => {}), /declined/);
  assert.equal(link.linked(), false);
});

test("every request carries the reader, and a spent token is renewed once", async () => {
  const store = memory();
  store.setItem("shirabe.link", JSON.stringify({ access: "old", refresh: "shrr_live", expiresAt: 0 }));
  const calls: Call[] = [];
  const sent: Array<string | undefined> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    if (url.endsWith("/oauth/token")) {
      calls.push({ url, body: await request.clone().json() as Record<string, string> });
      return new Response(JSON.stringify({ access_token: "fresh", expires_in: 3600 }), { status: 200 });
    }
    sent.push(request.headers.get("Authorization") ?? undefined);
    return new Response("{}", { status: 200 });
  }) as typeof globalThis.fetch;

  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });
  await link.fetch("https://shirabe.org/api/v1/parse", { method: "POST" });

  assert.equal(calls[0].body.grant_type, "refresh_token");
  assert.equal(calls[0].body.resource, "https://shirabe.org/api/v1");
  assert.deepEqual(sent, ["Bearer fresh"], "the expired token went out anyway");
});

test("the linked client keeps headers on a generated Request", async () => {
  const store = memory();
  store.setItem("shirabe.link", JSON.stringify({ access: "reader", expiresAt: Date.now() + 3600_000 }));
  let sent: Request | undefined;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    sent = new Request(input, init);
    return Response.json({ words: [] });
  }) as typeof globalThis.fetch;
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });
  const request = new Request("https://shirabe.org/api/v1/words/identify", {
    method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": "ja" }, body: "{}",
  });

  await link.fetch(request);

  assert.equal(sent?.headers.get("Authorization"), "Bearer reader");
  assert.equal(sent?.headers.get("Content-Type"), "application/json");
  assert.equal(sent?.headers.get("Accept-Language"), "ja");
});

test("a refresh token the server no longer honours is forgotten, not retried forever", async () => {
  const store = memory();
  store.setItem("shirabe.link", JSON.stringify({ access: "old", refresh: "revoked", expiresAt: 0 }));
  const { fetch } = server([{ status: 400, body: { error: "invalid_grant" } }]);
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });

  await link.fetch("https://shirabe.org/api/v1/parse");

  assert.equal(link.linked(), false);
  assert.equal(store.seen.has("shirabe.link"), false, "a dead token stays on the device");
});

test("temporary renewal errors preserve the session for retry", async () => {
  const store = memory();
  store.setItem("shirabe.link", JSON.stringify({ access: "old", refresh: "live", expiresAt: 0 }));
  const { fetch } = server([{ status: 503, body: { error: "server_error" } }]);
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });
  await assert.rejects(link.fetch("https://shirabe.org/api/v1/parse"), /try again/i);
  assert.equal(link.linked(), true);
  assert.match(store.getItem("shirabe.link")!, /live/);
});

test("a still-valid reader token renews early and remains usable through a temporary failure", async () => {
  const store = memory();
  let now = 1_000_000;
  store.setItem("shirabe.link", JSON.stringify({ access: "old", refresh: "live", expiresAt: now + 900_000, refreshAt: now }));
  let renewals = 0;
  const sent: string[] = [];
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, now: () => now,
    fetch: async (input, init) => {
      const request = input instanceof Request && init === undefined ? input : new Request(input, init);
      if (request.url.endsWith("/oauth/token")) {
        renewals++;
        return renewals === 1
          ? Response.json({ error: "server_error" }, { status: 503 })
          : Response.json({ access_token: "new", refresh_token: "next", expires_in: 1000 });
      }
      sent.push(request.headers.get("authorization") ?? "");
      return Response.json({});
    } });

  await link.fetch("https://shirabe.org/api/v1/parse");
  await link.fetch("https://shirabe.org/api/v1/parse");
  assert.equal(renewals, 1);
  assert.deepEqual(sent, ["Bearer old", "Bearer old"]);
  now += 5 * 60_000;
  await link.fetch("https://shirabe.org/api/v1/parse");
  assert.equal(renewals, 2);
  assert.equal(sent[2], "Bearer new");
  assert.equal(JSON.parse(store.getItem("shirabe.link")!).refreshAt, now + 700_000);
});

test("concurrent requests share one token renewal", async () => {
  const store = memory();
  store.setItem("shirabe.link", JSON.stringify({ access: "old", refresh: "live", expiresAt: 0 }));
  let renewals = 0;
  const fetch: typeof globalThis.fetch = async (input) => {
    if ((input instanceof Request ? input.url : String(input)).endsWith("/oauth/token")) {
      renewals++;
      await new Promise((resolve) => setTimeout(resolve, 0));
      return new Response(JSON.stringify({ access_token: "fresh", refresh_token: "next", expires_in: 3600 }));
    }
    return new Response("{}");
  };
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });
  await Promise.all([link.fetch("https://shirabe.org/a"), link.fetch("https://shirabe.org/b")]);
  assert.equal(renewals, 1);
});

test("storage that throws leaves the reader signed in for the session rather than refusing", () => {
  const hostile = {
    getItem() { throw new Error("site data blocked"); },
    setItem() { throw new Error("site data blocked"); },
    removeItem() { throw new Error("site data blocked"); },
  } as unknown as Storage;

  assert.doesNotThrow(() => createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: hostile }));
});

// The whole point of the pending status: a reader who is not signed in gets a
// step to take, and the card knows to ask the host to take it.
test("a 401 becomes a step the reader can take, not a failed lookup", async () => {
  const unauthorized = (async () => new Response(
    JSON.stringify({ title: "Bearer token required." }), { status: 401 },
  )) as typeof globalThis.fetch;

  const withLink = apiHost({ apiBase: "https://shirabe.org", fetch: unauthorized, signInPrompt: "Sign in to look this word up" });
  assert.deepEqual(await withLink.lookupEntry("猫-ねこ", "猫"), { status: "pending", message: "Sign in to look this word up" });

  // Without somewhere to send them, saying "sign in" would be a dead end.
  const alone = apiHost({ apiBase: "https://shirabe.org", fetch: unauthorized });
  assert.equal((await alone.lookupEntry("猫-ねこ", "猫")).status, "failed");
});

// Anki renders question and answer into ONE document, so a card template's
// script runs again on every flip and every card. Attaching twice used to mean
// two sets of listeners, and after ten cards a hover opened ten.
test("attaching again processes the page without stacking listeners", async () => {
  const { Window } = await import("happy-dom");
  const window = new Window({ url: "https://example.test/card" });
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement, Document: window.Document,
    Node: window.Node, NodeFilter: window.NodeFilter, DOMRect: window.DOMRect,
    getComputedStyle: window.getComputedStyle.bind(window),
  });
  const { default: ShirabeCard } = await import("../src/standalone.js");

  let lookups = 0;
  const host = {
    lookup: async () => { lookups++; return { status: "found" as const, definition: null }; },
    lookupEntry: async () => ({ status: "found" as const, definition: null }),
    tokenize: async () => [],
  };

  const options = { host, parse: true, styles: false, trigger: "click" as const };
  ShirabeCard.attach(options);
  ShirabeCard.attach(options);
  ShirabeCard.attach(options);
  const word = window.document.createElement("span");
  word.className = "sb-word";
  word.dataset.lemma = "猫";
  window.document.body.append(word);
  word.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(lookups, 1);
  ShirabeCard.detach();
});

// Signed out, a card template can cut nothing, so nothing is wrapped, so there
// is nothing to point at: the offer to sign in is behind the word it is
// blocking. Pointing at raw text is the way through, and it must arrive as the
// offer rather than as "no entry", which blames the word.
test("pointing at raw text while signed out offers the sign-in, not 'no entry'", async () => {
  const refused = (async () => new Response(
    JSON.stringify({ title: "Bearer token required." }), { status: 401 },
  )) as typeof globalThis.fetch;

  const host = apiHost({ apiBase: "https://shirabe.org", fetch: refused, signInPrompt: "Sign in" });
  assert.deepEqual(await host.lookup("猫が窓に座る。", "text"), { status: "pending", message: "Sign in" });
});

// A phone is where this flow actually runs, and on a phone the reader LEAVES:
// they tap the link, approve in a browser, and come back. The webview may have
// been suspended and the card certainly re-rendered, so the promise that was
// polling is gone and the approval it was waiting for is stranded on the server.
// Starting a fresh code there asks them to approve a second time, and a third.
test("an approval granted while the reader was away is collected, not re-asked", async () => {
  const store = memory();
  store.setItem("shirabe.pending", JSON.stringify({
    device_code: "dev-1", user_code: "FST7-4RZ3",
    verification_uri: "https://shirabe.org/link", interval: 0, expiresAt: 9e15,
  }));
  const { fetch, calls } = server([
    { body: { access_token: "shra_live", refresh_token: "shrr_live", expires_in: 3600 } },
  ]);
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });

  let shown: unknown;
  await link.signIn((message) => { shown = message; });

  assert.equal(link.linked(), true);
  assert.equal(calls.length, 1, "it asked for a new code instead of redeeming the one it had");
  assert.equal(calls[0].url, "https://shirabe.org/api/v1/oauth/token");
  assert.equal(calls[0].body.device_code, "dev-1");
  assert.equal(shown, undefined, "the reader had already done their part; do not show them a code again");
  assert.equal(store.seen.has("shirabe.pending"), false, "a spent code is not kept");
});

test("a code that expired while the reader was away is replaced, not retried forever", async () => {
  const store = memory();
  store.setItem("shirabe.pending", JSON.stringify({ device_code: "stale", interval: 0, expiresAt: 1 }));
  const { fetch, calls } = server([
    started,
    { body: { access_token: "shra_live", expires_in: 3600 } },
  ]);
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });

  await link.signIn(() => {});

  assert.equal(calls[0].url, "https://shirabe.org/api/v1/oauth/device_authorization");
  assert.equal(link.linked(), true);
});

test("a code still waiting on the reader is shown again rather than replaced", async () => {
  const store = memory();
  store.setItem("shirabe.pending", JSON.stringify({
    device_code: "dev-2", user_code: "AAAA-BBBB",
    verification_uri: "https://shirabe.org/link", interval: 0, expiresAt: 9e15,
  }));
  const { fetch, calls } = server([
    { status: 400, body: { error: "authorization_pending" } },
    { body: { access_token: "shra_live", expires_in: 3600 } },
  ]);
  const link = createLink({ apiBase: "https://shirabe.org", clientId: "c", storage: store, fetch });

  let shown: HTMLElement | undefined;
  await link.signIn((message) => { shown = message as HTMLElement; });

  assert.match(shown!.textContent!, /AAAA-BBBB/, "a second code would invalidate the one they are looking at");
  assert.equal(calls[0].body.device_code, "dev-2");
});

// What was actually in a reader's Anki config: the device code of a sign-in
// they had started, sitting in the slot the access token belongs in. The
// desktop's storage shim ignored the key it was handed, so `remember(pending)`
// and `write(token)` shared one slot and the last writer won.
//
// Read back as a session it was worse than no session at all. `linked()` said
// true, so the card believed it was signed in and never offered the sign-in
// again; every request went out bearing `undefined`, which the server counts
// against the 30/minute unauthenticated limit; and with no refresh token in it
// `renew()` bailed without clearing anything, so it never recovered.
//
// A session is an access token. Anything else in that slot is not one.
test("a slot holding something that is not a session reads as signed out", () => {
  const pending = JSON.stringify({
    device_code: "dc_x", user_code: "DVE3-Q4PQ",
    verification_uri: "https://shirabe.org/link", interval: 5,
    expiresAt: Date.now() + 600_000,
  });
  const storage = {
    getItem: () => pending,
    setItem: () => {},
    removeItem: () => {},
  } as unknown as Storage;

  const link = createLink({ apiBase: "https://shirabe.org", clientId: "shirabe-anki-card", storage });

  assert.equal(link.linked(), false, "half a sign-in is not a sign-in");
});
