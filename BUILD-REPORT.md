# deepsearch — Build Report

MCP Rebuild 100, Tier B. Clean-room rebuild of the Exa MCP server
(exa-mcp-server), built from the public tool spec captured in
`harness/fixtures/exa-tools-original.json` only. The fixture was
created for this build: it is docs-derived from the original project's
public documentation (the default-enabled tool names, parameter types,
required sets), marked `"_source": docs-derived ... not hand-probed`.
No audited ground truth for exa was found in the packages-100 indexes,
so no audited ground truth was claimed. Local build only — nothing
pushed or published, and no live network call was made or claimed at
any point.

Identity: repo `deepsearch`, npm `@reneturcios/deepsearch`,
MCP name `io.github.CloudCorpRecords/deepsearch`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `deepsearch: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Neural web search, code context, and
  page crawling through the Exa API." = **71 chars** (≤100 ✓);
  npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/deepsearch:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/deepsearch"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`search`, `code`, `crawl`, `mcp`,
  `--version`; exit 2 usage / 1 operation error), `src/mcp.ts`,
  `src/types.ts`, `src/search.ts` (core logic, `VERSION = "0.1.0"`)
- `test/search.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to deepsearch)

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the privatesearch precedent: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the public spec and
  break exact schema parity. Zod still validates every `tools/call`.
- Only the original server's default-enabled tools are rebuilt:
  `web_search_exa`, `get_code_context_exa`, `crawling_exa`. The
  optional company-research, deep-researcher, and LinkedIn tools are
  out of scope for this spec.
- Both endpoints are POSTs with the key from `EXA_API_KEY` sent as the
  `x-api-key` header: `https://api.exa.ai/search` for web search
  (`numResults`, default 8, inline text contents) and code context
  (token budget converted to a per-result character cap at ~4
  chars/token, assembled context trimmed to the budget), and
  `https://api.exa.ai/contents` for crawling one URL. Token budgets
  are clamped to the documented 1000–50000 range (default 5000).
- A missing key throws before any request, with an error naming
  `EXA_API_KEY`; over MCP this surfaces as an `isError` result
  (verified live over stdio, see below). API error bodies surface
  their `error`/`message` detail when present.
- All HTTP flows through an injectable `FetchFn` (types.ts). The test
  suite uses a fake fetch returning hand-written Exa-shaped JSON
  fixtures — **no live call was performed during this build**, so
  behaviour against the real API's current payloads is unverified
  (see Gaps).

## Verification (exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js` with the
`#!/usr/bin/env node` shebang.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 13
ℹ pass 13
ℹ fail 0
```
Covers: missing/blank key error naming EXA_API_KEY (and no request
made without a key), token clamping (default 5000, range
1000–50000) and token-to-character trimming, /search POST shape
(URL, method, `x-api-key` header, `query`/`numResults` body,
`numResults` default 8), result parsing with `requestId`, API error
detail surfacing (401 "Invalid API key"), code-context request sizing
from the budget, /contents POST shape and page-text return, honest
no-content crawl errors, and formatter output.

### 3. CLI / MCP smoke
`--version` → `0.1.0`; unknown command exits 2 with Usage. MCP
`initialize` over stdio → `serverInfo: {"name":"deepsearch",
"version":"0.1.0"}`. A `tools/call` for `web_search_exa` with
`EXA_API_KEY` unset returned `isError: true` with text
"EXA_API_KEY environment variable is required: set EXA_API_KEY to an
Exa API key and retry". CLI operations against the live API were
**not** run (offline build rule for this wave).

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/exa-tools-original.json \
    --rebuild "stdio:node /home/hatch/workspace/mcp-rebuild-100/builds/deepsearch/dist/cli.js mcp" \
    --out .../builds/deepsearch/parity-out
verdict=PASS parity_pct=100.0 original_tools=3 rebuild_tools=3 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
Original side is tools-file mode, so `fixture_results` records
`SKIPPED-TOOLS-FILE-MODE` — expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was copied from privatesearch's and edited with
the file edit tool: top-level `name`, root package `name`, and root
package `bin` key changed privatesearch -> deepsearch (dependency
ranges are identical, so the tree is unchanged). **Clean lockfile
regen required before publish** (regenerate with no `node_modules`
present); do not publish from this lockfile as-is. `node_modules` here
is a `cp -a` copy of privatesearch's (ownership-preservation warnings
during the copy were cosmetic; `.bin/tsc` / `.bin/tsx` verified
working).

## Gaps / honest notes

- No live Exa API call was made (VM egress is blocked and no key is
  available in this environment). Request construction and response
  normalisation are written against the documented `/search` and
  `/contents` payload shapes as captured in the hand-written test
  fixtures; a live smoke belongs to the publish wave.
- The original code-context tool assembles its context server-side
  from Exa's search-with-contents response; deepsearch reproduces the
  documented contract (query + token budget in, sourced excerpts out)
  by requesting ten candidates with a budget-derived per-result cap
  and trimming the assembled text to the budget. Exact excerpt
  selection may differ from the original's hosted implementation.
- Newer revisions of the original server add optional parameters to
  `web_search_exa` (search type, livecrawl, category, context size).
  They are not in the task spec's default tool definition and are not
  in the fixture, so they are not implemented; adding them later
  would change the schema and require a fixture update.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.

## Publish-gate remediation (2026-10-27)

Recorded under Rene's 2026-10-27 decision ("Remediate the 6: add param
descriptions + capability-class vet policy, then re-gate") and
`publish/GATE-POLICY.md`, following the standing Wave 2 remediation
pattern. This is an authorized deviation from the parity-faithful
state: descriptions were added to every tool parameter that lacked
one, in the `src/mcp.ts` schema literals only — parameter names,
types and required lists are unchanged.

- Descriptions added: 6 insertion points, covering 6 served parameter
  occurrences (no shared schema consts in this unit; each insertion
  serves exactly one occurrence). Insertion points:
  `web_search_exa` parameters `query`, `numResults`;
  `get_code_context_exa` parameters `query`, `tokensNum`; and
  `crawling_exa` parameters `url`, `tokensNum`.
- Rebuild: `npm run build` exit 0; `tsc --noEmit` exit 0; full
  test suite 13/13 pass (tests 13, pass 13, fail 0).
- Parity harness re-run, verbatim: **PARTIAL, parity_pct 50.0** —
  original_tools=3 rebuild_tools=3 missing=[] extra=[]
  schema_diffs=['crawling_exa', 'get_code_context_exa', 'web_search_exa'].
  Every one of the 6 schema diffs is a description addition
  (`*.description: present in rebuild but not in original`); 0
  structural diffs. Structural parity proven independently:
  stripping `description` keys from BOTH the pre- and
  post-remediation tools/list deep-equals (strip-proof RESULT: PASS;
  every description present in PRE is byte-identical in POST, and
  the only additions are at inputSchema property paths — 6
  additions, 0 removals). Adjudication: the description-only diff
  is the authorized remediation itself; structural parity is
  unchanged. Full record:
  `publish/parity-remediation/deepsearch/parity.json` and
  `publish/parity-remediation/deepsearch/strip-proof.txt`.
- No publish gate was run in this remediation (no mcpaudit/mcpvet),
  and nothing was published.
