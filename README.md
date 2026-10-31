# deepsearch

deepsearch asks Exa's neural index questions the way a researcher
would. A plain search returns the pages that best match the meaning of
a query, with their text already pulled in. A code question gets a
context pack instead: examples and documentation excerpts gathered
from across the web and sized to a token budget you choose. And when
you already know the page you want, a crawl fetches that one page and
hands back its words. It runs from the command line or as an MCP
server for agents.

An Exa API key is required. Put it in the `EXA_API_KEY` environment
variable; the key is sent to the API as the `x-api-key` header and
never appears in output. When the variable is missing, every operation
fails with an error that names it.

## Install

```bash
npx @reneturcios/deepsearch search "vector index tradeoffs"
```

Or run the container image:

```bash
docker run -i -e EXA_API_KEY ghcr.io/cloudcorprecords/deepsearch
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
export EXA_API_KEY="your api key"

# Web search; --num-results defaults to 8
deepsearch search "ferry electrification programs"
deepsearch search "ferry electrification programs" --num-results 5

# Code context; --tokens sets the budget (1000-50000, default 5000)
deepsearch code "React useState hook examples" --tokens 3000

# Fetch one page in full
deepsearch crawl https://example.com/some/article
deepsearch crawl https://example.com/some/article --tokens 2000

# Machine-readable output for any command
deepsearch search "ferry electrification programs" --json

deepsearch --version
```

Exit codes: `0` on success, `1` when an operation fails (including a
missing `EXA_API_KEY` or an API error), `2` for usage errors.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/deepsearch mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "deepsearch": {
      "command": "npx",
      "args": ["-y", "@reneturcios/deepsearch", "mcp"],
      "env": { "EXA_API_KEY": "your api key" }
    }
  }
}
```

### Tools

These are the original server's default-enabled tools:

| Tool | Input | What it returns |
| --- | --- | --- |
| `web_search_exa` | `query` (string, required), `numResults` (number, optional, default 8) | Matching pages as a numbered text block: title, URL, publication details when known, and the page text the API supplied. |
| `get_code_context_exa` | `query` (string, required), `tokensNum` (number, optional, 1000–50000, default 5000) | Code examples and documentation excerpts for the question, each headed by its source, trimmed to the token budget. |
| `crawling_exa` | `url` (string, required), `tokensNum` (number, optional, default 5000) | The full text of that one page, titled, trimmed to the token budget. |

Token budgets are clamped to the documented 1000–50000 range and are
applied at roughly four characters per token. An empty result set is
reported as such; a page the API cannot fetch, a missing key, or a
failed API call is reported as a tool error.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
