import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clampTokens,
  crawlingExa,
  formatCrawl,
  formatSearchOutcome,
  getCodeContextExa,
  parseSearchOutcome,
  requireApiKey,
  trimToTokens,
  webSearchExa,
} from "../src/search.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

// Hand-written fixtures in the documented shapes of the Exa API
// responses: /search answers with requestId plus a results array whose
// entries carry title, url, and inline text; /contents answers with the
// same results shape for the requested URLs.
const SEARCH_PAYLOAD = {
  requestId: "req-fixture-1",
  results: [
    {
      title: "Understanding Vector Indexes",
      url: "https://example.com/vector-indexes",
      publishedDate: "2026-10-01T00:00:00.000Z",
      author: "A. Researcher",
      text: "A vector index stores embeddings for nearest-neighbour lookup.",
    },
    {
      title: "Embeddings, Gently",
      url: "https://example.com/embeddings",
      text: "Embeddings turn text into numbers.",
    },
  ],
};

const CODE_PAYLOAD = {
  requestId: "req-fixture-2",
  results: [
    {
      title: "useState examples - React docs",
      url: "https://react.dev/reference/react/useState",
      text: "const [count, setCount] = useState(0);",
    },
  ],
};

const CONTENTS_PAYLOAD = {
  requestId: "req-fixture-3",
  results: [
    {
      title: "A Page About Ferries",
      url: "https://example.com/ferries",
      text: "Ferries cross the bay every thirty minutes.",
    },
  ],
  statuses: [{ id: "https://example.com/ferries", status: "success" }],
};

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
  init?: { method?: string; headers?: Record<string, string>; body?: string };
}

/** Fake fetch: records the request, serves fixture bodies by path. */
function fakeFetch(captured: Captured): FetchFn {
  return async (url: string, init?: Captured["init"]) => {
    captured.url = url;
    captured.init = init;
    if (url === "https://api.exa.ai/search") {
      const body = JSON.parse(init?.body ?? "{}") as { query?: string };
      return jsonResponse(body.query?.includes("useState") ? CODE_PAYLOAD : SEARCH_PAYLOAD);
    }
    if (url === "https://api.exa.ai/contents") return jsonResponse(CONTENTS_PAYLOAD);
    return jsonResponse({ error: "not found" }, 404, "Not Found");
  };
}

describe("requireApiKey", () => {
  it("rejects a missing or blank key with an error naming EXA_API_KEY", () => {
    assert.throws(() => requireApiKey(undefined), /EXA_API_KEY/);
    assert.throws(() => requireApiKey("  "), /EXA_API_KEY/);
    assert.equal(requireApiKey(" test-key "), "test-key");
  });
});

describe("clampTokens / trimToTokens", () => {
  it("defaults to 5000 and clamps into the 1000-50000 range", () => {
    assert.equal(clampTokens(undefined), 5000);
    assert.equal(clampTokens(10), 1000);
    assert.equal(clampTokens(999999), 50000);
    assert.equal(clampTokens(3000), 3000);
  });

  it("trims text at four characters per token", () => {
    const long = "x".repeat(100);
    assert.equal(trimToTokens(long, 10).length, 40);
    assert.equal(trimToTokens("short", 5000), "short");
  });
});

describe("webSearchExa", () => {
  it("POSTs to /search with the x-api-key header and parses results", async () => {
    const captured: Captured = {};
    const out = await webSearchExa(fakeFetch(captured), "test-key", {
      query: "vector indexes",
      numResults: 5,
    });
    assert.equal(captured.url, "https://api.exa.ai/search");
    assert.equal(captured.init?.method, "POST");
    assert.equal(captured.init?.headers?.["x-api-key"], "test-key");
    const body = JSON.parse(captured.init?.body ?? "{}") as Record<string, unknown>;
    assert.equal(body.query, "vector indexes");
    assert.equal(body.numResults, 5);
    assert.equal(out.requestId, "req-fixture-1");
    assert.equal(out.results.length, 2);
    assert.equal(out.results[0].title, "Understanding Vector Indexes");
    assert.ok(out.results[0].text?.includes("nearest-neighbour"));
  });

  it("defaults numResults to 8 when not given", async () => {
    const captured: Captured = {};
    await webSearchExa(fakeFetch(captured), "test-key", { query: "embeddings" });
    const body = JSON.parse(captured.init?.body ?? "{}") as Record<string, unknown>;
    assert.equal(body.numResults, 8);
  });

  it("fails before any request when the key is missing", async () => {
    let called = false;
    const spy: FetchFn = async () => {
      called = true;
      return jsonResponse({});
    };
    await assert.rejects(() => webSearchExa(spy, undefined, { query: "x" }), /EXA_API_KEY/);
    assert.equal(called, false);
  });

  it("rejects an empty query and surfaces API error details", async () => {
    await assert.rejects(() => webSearchExa(fakeFetch({}), "k", { query: " " }), /non-empty/);
    const failing: FetchFn = async () =>
      jsonResponse({ error: "Invalid API key" }, 401, "Unauthorized");
    await assert.rejects(() => webSearchExa(failing, "k", { query: "x" }), /Invalid API key/);
  });
});

describe("getCodeContextExa", () => {
  it("requests context sized by the token budget and returns sources", async () => {
    const captured: Captured = {};
    const out = await getCodeContextExa(fakeFetch(captured), "test-key", {
      query: "React useState hook examples",
      tokensNum: 3000,
    });
    const body = JSON.parse(captured.init?.body ?? "{}") as {
      contents?: { text?: { maxCharacters?: number } };
    };
    assert.equal(body.contents?.text?.maxCharacters, 12000);
    assert.equal(out.results.length, 1);
    assert.ok(out.results[0].text?.includes("useState(0)"));
  });

  it("clamps an out-of-range token budget before sizing the request", async () => {
    const captured: Captured = {};
    await getCodeContextExa(fakeFetch(captured), "test-key", { query: "q", tokensNum: 5 });
    const body = JSON.parse(captured.init?.body ?? "{}") as {
      contents?: { text?: { maxCharacters?: number } };
    };
    assert.equal(body.contents?.text?.maxCharacters, 4000);
  });
});

describe("crawlingExa", () => {
  it("POSTs the URL to /contents and returns the page text", async () => {
    const captured: Captured = {};
    const out = await crawlingExa(fakeFetch(captured), "test-key", {
      url: "https://example.com/ferries",
    });
    assert.equal(captured.url, "https://api.exa.ai/contents");
    const body = JSON.parse(captured.init?.body ?? "{}") as Record<string, unknown>;
    assert.deepEqual(body.urls, ["https://example.com/ferries"]);
    assert.equal(out.title, "A Page About Ferries");
    assert.ok(out.text.includes("Ferries cross the bay"));
  });

  it("errors honestly when the API returns no content for the URL", async () => {
    const empty: FetchFn = async () =>
      jsonResponse({ results: [], statuses: [{ id: "u", status: "error", error: " robots blocked" }] });
    await assert.rejects(
      () => crawlingExa(empty, "k", { url: "https://example.com/x" }),
      /could not fetch/,
    );
    await assert.rejects(() => crawlingExa(fakeFetch({}), "k", { url: "" }), /non-empty/);
  });
});

describe("parseSearchOutcome / formatters", () => {
  it("tolerates payloads without a results array", () => {
    assert.deepEqual(parseSearchOutcome("q", { requestId: "r" }).results, []);
    assert.deepEqual(parseSearchOutcome("q", null).results, []);
  });

  it("formats outcomes as readable text blocks", () => {
    const text = formatSearchOutcome({
      query: "vector indexes",
      results: [{ title: "T", url: "https://example.com", text: "Body." }],
    });
    assert.ok(text.includes("1. T"));
    assert.ok(text.includes("Body."));
    assert.equal(formatSearchOutcome({ query: "q", results: [] }), 'No results for "q".');
    assert.ok(formatCrawl({ url: "https://e.com", title: "Ti", text: "Tx" }).includes("Ti"));
  });
});
