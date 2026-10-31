/**
 * deepsearch core: web search, code context, and page crawling against
 * the Exa API.
 *
 * Two endpoints do all the work, both POSTs with a JSON body and the key
 * sent as the x-api-key header:
 *
 *   POST https://api.exa.ai/search    body { query, numResults?,
 *                                     contents: { text: ... } }
 *   POST https://api.exa.ai/contents  body { urls: [url], text: true }
 *
 * The web search asks for each result's text inline. The code-context
 * search runs the same endpoint but sizes its answer by a token budget
 * instead of a result count: the budget is converted into a per-result
 * character cap (one token is roughly four characters) and the assembled
 * context is trimmed to the budget. Crawling sends one URL to the
 * contents endpoint and returns that page's text, likewise trimmed.
 *
 * A missing API key is an error before any request is made, and the
 * error names the EXA_API_KEY variable so a misconfigured client is easy
 * to fix. All HTTP goes through an injected FetchFn so request building
 * and response normalisation are fully testable offline.
 */
import type {
  CodeContextOptions,
  CrawlOptions,
  CrawlOutcome,
  FetchFn,
  PageResult,
  SearchOutcome,
  WebSearchOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const SEARCH_URL = "https://api.exa.ai/search";
export const CONTENTS_URL = "https://api.exa.ai/contents";

export const API_KEY_ENV = "EXA_API_KEY";

export const DEFAULT_NUM_RESULTS = 8;
export const DEFAULT_TOKENS = 5000;
export const MIN_TOKENS = 1000;
export const MAX_TOKENS = 50000;

/** Rough characters-per-token ratio used to turn budgets into caps. */
export const CHARS_PER_TOKEN = 4;

/** The honest missing-key error. Names the variable, never a value. */
export function requireApiKey(apiKey: string | undefined): string {
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!key) {
    throw new Error(
      "EXA_API_KEY environment variable is required: set EXA_API_KEY to an Exa API key and retry",
    );
  }
  return key;
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

export function clampTokens(tokensNum: number | undefined): number {
  if (tokensNum === undefined || !Number.isFinite(tokensNum)) return DEFAULT_TOKENS;
  return Math.min(MAX_TOKENS, Math.max(MIN_TOKENS, Math.floor(tokensNum)));
}

function clampNumResults(numResults: number | undefined): number {
  if (numResults === undefined || !Number.isFinite(numResults)) return DEFAULT_NUM_RESULTS;
  return Math.max(1, Math.floor(numResults));
}

/** Trim text to a token budget (approximated in characters). */
export function trimToTokens(text: string, tokensNum: number): string {
  const cap = tokensNum * CHARS_PER_TOKEN;
  return text.length > cap ? text.slice(0, cap) : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

async function postJson(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  url: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const key = requireApiKey(apiKey);
  let response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": key,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(
      `Exa API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) detail = str(payload.error) ?? str(payload.message) ?? "";
    } catch {
      detail = "";
    }
    throw new Error(
      `Exa API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail ? `: ${detail}` : ""}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Exa API returned a response that was not valid JSON");
  }
  if (!isRecord(payload)) throw new Error("Exa API returned an unexpected response shape");
  return payload;
}

/** Normalise one raw Exa result record into the shared page shape. */
export function parsePageResult(raw: unknown): PageResult | null {
  if (!isRecord(raw)) return null;
  const url = str(raw.url) ?? str(raw.id);
  if (!url) return null;
  return {
    title: str(raw.title) ?? url,
    url,
    text: typeof raw.text === "string" ? raw.text : undefined,
    publishedDate: str(raw.publishedDate) ?? str(raw.published_date),
    author: str(raw.author),
  };
}

/** Normalise a /search payload into the shared outcome shape. */
export function parseSearchOutcome(query: string, payload: unknown): SearchOutcome {
  const results: PageResult[] = [];
  if (isRecord(payload) && Array.isArray(payload.results)) {
    for (const raw of payload.results) {
      const item = parsePageResult(raw);
      if (item) results.push(item);
    }
  }
  return {
    query,
    requestId: isRecord(payload) ? str(payload.requestId) : undefined,
    results,
  };
}

/** General web search: POST /search with inline text contents. */
export async function webSearchExa(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: WebSearchOptions,
): Promise<SearchOutcome> {
  const query = requireNonEmpty(options.query, "query");
  const payload = await postJson(fetchFn, apiKey, SEARCH_URL, {
    query,
    numResults: clampNumResults(options.numResults),
    contents: { text: { maxCharacters: 10000 } },
  });
  return parseSearchOutcome(query, payload);
}

/**
 * Code-context search: POST /search sized by a token budget. Ten
 * candidate results are requested with a per-result character cap
 * derived from the budget, and the assembled context is trimmed to the
 * budget before returning.
 */
export async function getCodeContextExa(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: CodeContextOptions,
): Promise<SearchOutcome> {
  const query = requireNonEmpty(options.query, "query");
  const tokens = clampTokens(options.tokensNum);
  const payload = await postJson(fetchFn, apiKey, SEARCH_URL, {
    query,
    numResults: 10,
    contents: { text: { maxCharacters: tokens * CHARS_PER_TOKEN } },
  });
  const outcome = parseSearchOutcome(query, payload);
  let remaining = tokens * CHARS_PER_TOKEN;
  for (const result of outcome.results) {
    if (result.text === undefined) continue;
    result.text = result.text.slice(0, Math.max(0, remaining));
    remaining -= result.text.length;
  }
  return outcome;
}

/** Crawl one page: POST /contents for its full text. */
export async function crawlingExa(
  fetchFn: FetchFn,
  apiKey: string | undefined,
  options: CrawlOptions,
): Promise<CrawlOutcome> {
  const url = requireNonEmpty(options.url, "url");
  const tokens = clampTokens(options.tokensNum);
  const payload = await postJson(fetchFn, apiKey, CONTENTS_URL, {
    urls: [url],
    text: true,
  });
  const first =
    Array.isArray(payload.results) && payload.results.length > 0
      ? parsePageResult(payload.results[0])
      : null;
  if (!first || first.text === undefined) {
    const statuses = payload.statuses;
    if (Array.isArray(statuses) && isRecord(statuses[0]) && str(statuses[0].error)) {
      throw new Error(`Exa could not fetch ${url}: ${String(statuses[0].error)}`);
    }
    throw new Error(`Exa returned no content for ${url}`);
  }
  return { url, title: first.title, text: trimToTokens(first.text, tokens) };
}

/** Render search results as the plain-text block MCP clients display. */
export function formatSearchOutcome(out: SearchOutcome): string {
  if (out.results.length === 0) return `No results for "${out.query}".`;
  return out.results
    .map((r, i) => {
      const lines = [`${i + 1}. ${r.title}`, `   ${r.url}`];
      if (r.publishedDate) lines.push(`   Published: ${r.publishedDate}`);
      if (r.author) lines.push(`   Author: ${r.author}`);
      if (r.text) lines.push(r.text);
      return lines.join("\n");
    })
    .join("\n\n");
}

/** Render code-context results as titled, fenced source blocks. */
export function formatCodeContext(out: SearchOutcome): string {
  if (out.results.length === 0) return `No code context found for "${out.query}".`;
  return out.results
    .map((r) => {
      const head = `Source: ${r.title} (${r.url})`;
      return r.text ? `${head}\n${r.text}` : head;
    })
    .join("\n\n");
}

/** Render a crawl outcome as a titled text block. */
export function formatCrawl(out: CrawlOutcome): string {
  return out.title ? `${out.title}\n${out.url}\n\n${out.text}` : `${out.url}\n\n${out.text}`;
}
