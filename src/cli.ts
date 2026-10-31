#!/usr/bin/env node
/**
 * deepsearch CLI.
 *
 *   deepsearch search <query> [--num-results n] [--json]
 *   deepsearch code <query> [--tokens n] [--json]
 *   deepsearch crawl <url> [--tokens n] [--json]
 *   deepsearch mcp
 *
 * Reads the Exa key from EXA_API_KEY.
 * Exit codes: 0 success, 1 search/crawl error, 2 usage error.
 */
import {
  API_KEY_ENV,
  crawlingExa,
  formatCodeContext,
  formatCrawl,
  formatSearchOutcome,
  getCodeContextExa,
  VERSION,
  webSearchExa,
} from "./search.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  deepsearch search <query> [--num-results n] [--json]
  deepsearch code <query> [--tokens n] [--json]
  deepsearch crawl <url> [--tokens n] [--json]
  deepsearch mcp
  deepsearch --version`);
  process.exit(2);
}

function flagValue(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx < 0 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function withoutFlags(args: string[], valueFlags: string[], boolFlags: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (valueFlags.includes(args[i])) i++;
    else if (!boolFlags.includes(args[i])) out.push(args[i]);
  }
  return out;
}

function numFlag(args: string[], name: string): number | undefined {
  const raw = flagValue(args, name);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const apiKey = process.env[API_KEY_ENV];
  try {
    const asJson = rest.includes("--json");
    if (cmd === "search") {
      const positional = withoutFlags(rest, ["--num-results"], ["--json"]);
      const query = positional.join(" ").trim();
      if (!query) usage();
      const out = await webSearchExa(fetchFn, apiKey, {
        query,
        numResults: numFlag(rest, "--num-results"),
      });
      console.log(asJson ? JSON.stringify(out, null, 2) : formatSearchOutcome(out));
    } else if (cmd === "code") {
      const positional = withoutFlags(rest, ["--tokens"], ["--json"]);
      const query = positional.join(" ").trim();
      if (!query) usage();
      const out = await getCodeContextExa(fetchFn, apiKey, {
        query,
        tokensNum: numFlag(rest, "--tokens"),
      });
      console.log(asJson ? JSON.stringify(out, null, 2) : formatCodeContext(out));
    } else if (cmd === "crawl") {
      const positional = withoutFlags(rest, ["--tokens"], ["--json"]);
      const [url] = positional;
      if (!url) usage();
      const out = await crawlingExa(fetchFn, apiKey, {
        url,
        tokensNum: numFlag(rest, "--tokens"),
      });
      console.log(asJson ? JSON.stringify(out, null, 2) : formatCrawl(out));
    } else {
      usage();
    }
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
