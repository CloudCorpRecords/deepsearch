/**
 * deepsearch MCP server. Tools: web_search_exa, get_code_context_exa,
 * crawling_exa.
 *
 * Why the low-level Server instead of McpServer: the high-level helper
 * converts zod schemas to JSON Schema and injects keys that are not in
 * this tool's public spec ("$schema" and "additionalProperties"), which
 * breaks exact tool-list/schema parity with the spec. This file serves
 * tools/list with the spec's exact input schemas as explicit literals,
 * while zod still validates every tools/call argument set. Tool names,
 * parameters, and required sets are taken from the public spec of the
 * original server's default-enabled tool set.
 *
 * The Exa key is read from EXA_API_KEY at call time; a missing key
 * returns an honest isError result naming the variable instead of
 * failing the handshake.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  crawlingExa,
  formatCodeContext,
  formatCrawl,
  formatSearchOutcome,
  getCodeContextExa,
  VERSION,
  webSearchExa,
} from "./search.js";
import type { FetchFn } from "./types.js";

const WebSearchArgs = z.object({
  query: z.string(),
  numResults: z.number().optional(),
});

const CodeContextArgs = z.object({
  query: z.string(),
  tokensNum: z.number().optional(),
});

const CrawlingArgs = z.object({
  url: z.string(),
  tokensNum: z.number().optional(),
});

const TOOLS = [
  {
    name: "web_search_exa",
    description: "Search the web with Exa and return relevant pages with their text content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The web search query to run with Exa." },
        numResults: { type: "number", description: "Optional number of search results to return; defaults to 8." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_code_context_exa",
    description: "Find code examples and documentation for a programming question and return them as context.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The programming question or code search query to find examples and documentation for." },
        tokensNum: { type: "number", description: "Optional token budget for the returned code context, clamped to 1000-50000; defaults to 5000." },
      },
      required: ["query"],
    },
  },
  {
    name: "crawling_exa",
    description: "Fetch the full text content of a specific web page by URL.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL of the web page to fetch the full text content of." },
        tokensNum: { type: "number", description: "Optional token budget for the returned page text, clamped to 1000-50000; defaults to 5000." },
      },
      required: ["url"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "deepsearch", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env.EXA_API_KEY;
  try {
    if (name === "web_search_exa") {
      const parsed = WebSearchArgs.parse(args ?? {});
      return textResult(formatSearchOutcome(await webSearchExa(fetchFn, apiKey, parsed)));
    }
    if (name === "get_code_context_exa") {
      const parsed = CodeContextArgs.parse(args ?? {});
      return textResult(formatCodeContext(await getCodeContextExa(fetchFn, apiKey, parsed)));
    }
    if (name === "crawling_exa") {
      const parsed = CrawlingArgs.parse(args ?? {});
      return textResult(formatCrawl(await crawlingExa(fetchFn, apiKey, parsed)));
    }
  } catch (err) {
    return errorResult(err);
  }
  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
