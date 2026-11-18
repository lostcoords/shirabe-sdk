import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createShirabeClient, search } from "../src/index.js";

test("package version matches the OpenAPI contract", () => {
  const packageManifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const specification = readFileSync(
    new URL("../openapi/shirabe.bundled.yaml", import.meta.url),
    "utf8",
  );
  const contractVersion = specification.match(
    /^info:\n(?: {2}.*\n)*? {2}version:\s*([^\s#]+)/m,
  )?.[1];

  assert.ok(contractVersion);
  assert.equal(packageManifest.version, contractVersion);
});

test("a generated operation uses the configured origin and current bearer token", async () => {
  let request: Request | undefined;
  let token = "first-token";
  const client = createShirabeClient({
    accessToken: () => token,
    baseUrl: "https://api.shirabe.test/",
    fetch: async (input) => {
      request = input instanceof Request ? input : new Request(input);
      return Response.json({
        query: "猫",
        sources: [{ dictionary: "jmdict", languages: ["ja", "en"] }],
        segments: [],
      });
    },
  });

  token = "renewed-token";
  const { data, error } = await search({
    client,
    body: {
      query: "猫",
      filters: {
        sources: [{ dictionary: "jmdict", languages: ["ja", "en"] }],
      },
    },
  });

  assert.equal(error, undefined);
  assert.equal(data?.query, "猫");
  assert.equal(request?.url, "https://api.shirabe.test/api/v1/search");
  assert.equal(request?.method, "POST");
  assert.equal(request?.headers.get("authorization"), "Bearer renewed-token");
  assert.deepEqual(await request?.json(), {
    query: "猫",
    filters: {
      sources: [{ dictionary: "jmdict", languages: ["ja", "en"] }],
    },
  });
});
