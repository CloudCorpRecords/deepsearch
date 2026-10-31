/**
 * deepsearch types.
 *
 * Two of the three operations are searches: a general web search sized by
 * a result count, and a code-context search sized by a token budget. The
 * third fetches one known page. All three yield the same normalised page
 * shape — title, URL, and the page text when the upstream supplied it —
 * so callers handle one result type.
 *
 * HTTP access is described by a minimal response surface so tests can
 * inject a fake fetch and never touch the network.
 */

export interface WebSearchOptions {
  query: string;
  /** Number of results to return. Defaults to 8. */
  numResults?: number;
}

export interface CodeContextOptions {
  query: string;
  /** Token budget for the returned context, 1000-50000. Defaults to 5000. */
  tokensNum?: number;
}

export interface CrawlOptions {
  url: string;
  /** Token budget for the returned page text. Defaults to 5000. */
  tokensNum?: number;
}

export interface PageResult {
  title: string;
  url: string;
  text?: string;
  publishedDate?: string;
  author?: string;
}

export interface SearchOutcome {
  query: string;
  requestId?: string;
  results: PageResult[];
}

export interface CrawlOutcome {
  url: string;
  title?: string;
  text: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
