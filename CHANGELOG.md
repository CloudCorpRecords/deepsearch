# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `deepsearch search <query>` with `--num-results`,
  `deepsearch code <query>` and `deepsearch crawl <url>` with
  `--tokens`, all with `--json`; the Exa key is read from `EXA_API_KEY`.
- MCP server (`deepsearch mcp`, stdio) with the three default tools:
  `web_search_exa`, `get_code_context_exa`, and `crawling_exa`.
- Searches POST to `https://api.exa.ai/search` and crawls to
  `https://api.exa.ai/contents`, with the key sent as the `x-api-key`
  header; responses are normalised into one page shape.
- Token budgets are clamped to 1000–50000 and applied at roughly four
  characters per token.
- A missing `EXA_API_KEY` fails honestly with an error naming the
  variable, before any request is made.
- All HTTP goes through an injectable fetch function, so the test suite
  runs entirely on hand-written fixtures with no network access.
