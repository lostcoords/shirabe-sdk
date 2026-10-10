import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  type Card,
  createShirabeClient,
  gradeCard,
  search,
  undoLatestReview,
} from "../src/index.js";

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

test("the generated client undoes the review ID returned by grading", async () => {
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  const revision = "a".repeat(64);
  const card: Card = {
    id: 12,
    revision: "b".repeat(64),
    state: "learning",
    srsStage: "Apprentice",
    note: {
      id: 8,
      title: "{{c3::猫}}",
      type: { id: 2, name: "Cloze", kind: "cloze" },
      fields: [{ name: "Text", value: "<b>{{c3::猫}}</b>[sound:cat.mp3]" }],
      tags: ["Japanese"],
      driftFlagged: false,
    },
    template: { id: 5, name: "Recall", ordinal: 0 },
    clozeNumber: 3,
    deck: { id: 1, name: "Japanese" },
  };
  const client = createShirabeClient({
    accessToken: "review-token",
    baseUrl: "https://api.shirabe.test",
    fetch: async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      requests.push({
        method: request.method,
        path: new URL(request.url).pathname,
        body: await request.json(),
      });
      return Response.json(
        request.method === "POST"
          ? {
              reviewId: 731,
              card,
              intervals: { again: "1m", hard: "1d", good: "4d", easy: "8d" },
            }
          : { card: { ...card, state: "new", revision } },
      );
    },
  });
  const grade = await gradeCard({
    client,
    body: { cardId: 12, revision, rating: 3 },
  });
  assert.equal(grade.error, undefined);
  assert.equal(grade.data?.reviewId, 731);
  assert.equal(grade.data?.card.note.id, 8);
  assert.equal(grade.data?.card.clozeNumber, 3);
  assert.equal(grade.data?.card.note.headword, undefined);
  assert.deepEqual(grade.data?.card.note.fields, card.note.fields);
  assert.deepEqual(grade.data?.card.note.tags, ["Japanese"]);
  assert.equal("headword" in grade.data!.card, false);
  const undo = await undoLatestReview({
    client,
    body: { reviewId: grade.data!.reviewId },
  });
  assert.equal(undo.error, undefined);
  assert.equal(undo.data?.card.state, "new");
  assert.deepEqual(undo.data?.card.note, card.note);
  assert.deepEqual(requests, [
    {
      method: "POST",
      path: "/api/v1/srs/reviews",
      body: { cardId: 12, revision, rating: 3 },
    },
    {
      method: "DELETE",
      path: "/api/v1/srs/reviews/latest",
      body: { reviewId: 731 },
    },
  ]);
});
