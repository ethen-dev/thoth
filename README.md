# T.H.O.T.H.

**Transversal Heuristic Organizer of Trusted History**

T.H.O.T.H. is a local memory system for turning scattered information into a durable **LLM Wiki**: Markdown documents with YAML frontmatter, relations, derived indexes, CLI operations, and an MCP server for LLM clients.

The current MVP is local-first. Markdown is the source of truth. `.thoth/index.json` and `.thoth/relations.json` are derived and can be regenerated.

## Status

Usable local MVP components:

- CLI: `init`, `status`, `list`, `show`, `capture`, `append`, `log`, `search`, `index`, `lint`, `sync-links`, `update`, `relate`, `source`, `doctor` and `agents`.
- MCP stdio server with the implemented tools, resources, and `capture_memory` prompt listed below.
- JSON Schemas for wiki documents and derived indexes.
- External wiki support via `thoth.config.json`.

## Install For Development

```bash
npm install
npm run build
```

Package smoke test:

```bash
npm run package:smoke
```

This command builds the project, runs `npm pack`, installs the tarball in a temporary workspace, and exercises installed `thoth` and `thoth-mcp` binaries.

Run the CLI from source:

```bash
npm run dev -- --help
```

Run the built binaries:

```bash
node dist/cli/index.js --help
node dist/mcp/server.js --version
```

## Minimal Config

Create `thoth.config.json` in your workspace:

```json
{
  "wikiPath": "../wiki"
}
```

`wikiPath` may point outside the repository. This is the recommended shape: project code and durable wiki memory stay separate.

## Quickstart

Initialize the wiki:

```bash
npm run dev -- init
```

Capture a note:

```bash
npm run dev -- capture "T.H.O.T.H. keeps durable context in Markdown." --type note --title "Durable Context" --tag memory
```

List and read documents:

```bash
npm run dev -- list
npm run dev -- show note-durable-context
```

Append to an existing document:

```bash
npm run dev -- append note-durable-context "This note was extended later." --section Notes
```

Search and relate knowledge:

```bash
npm run dev -- search "durable context"
npm run dev -- relate note-durable-context project-thoth --relation belongs_to
npm run dev -- sync-links
```

Capture a raw source and link it to a derived document:

```bash
npm run dev -- source add "raw transcript or pasted material" --title "Interview Alpha" --tag raw
npm run dev -- source link source-interview-alpha note-durable-context
```

Rebuild indexes and diagnose the workspace:

```bash
npm run dev -- index
npm run dev -- lint
npm run dev -- doctor
```

## MCP

Start the MCP server over stdio:

```bash
npm run mcp:dev -- --version
node dist/mcp/server.js --version
```

Client configuration examples are documented in `docs/mcp-configuration.md`.

Implemented MCP tools:

- `wiki_search`
- `wiki_list`
- `wiki_show`
- `wiki_capture`
- `wiki_update`
- `wiki_relate`
- `wiki_index`
- `wiki_lint`
- `wiki_log`
- `skill_list`, `skill_show`, `skill_validate`, `skill_run`
- `core_plan`, `core_execute`

Implemented MCP resources:

- `thoth://wiki/index`
- `thoth://document/{id}`

Implemented MCP prompts:

- `capture_memory`

MCP resources are `thoth://wiki/index` and `thoth://document/{id}`. The only
implemented prompt is `capture_memory`; tools and resources are not prompts.

## Agents and skills

The `agents` CLI manages registry metadata: `agents list`, `agents show`,
`agents register`, `agents unregister`, and `agents validate`. Entries declare
metadata such as source, category, status, path, and runtime
(`opencode`, `prompt`, or `external`); the registry does not execute agents.

Skills are discovered from the packaged `skills/` pack and optional workspace
`.thoth/skills/` directories. Markdown bodies are documentation only. The LLM
skills `wiki-ingest`, `wiki-crystallize`, `wiki-integrate` and `wiki-config`
require an injected `SkillProviderAdapter.complete(request)` and return a
strictly validated JSON proposal. No provider is discovered or selected by
default. API/tests can run them safely with `plan`, `dry-run` or confirmed
`execute` using a trusted adapter; this is not a sandbox. CLI/MCP expose the
contract but do not select implicit providers. The runtime never executes
shell, Markdown, or an implicit provider.

```bash
thoth skills run wiki-ingest --mode plan --input '{"content":"..."}'
thoth skills run wiki-ingest --mode dry-run --input '{"content":"..."}'
```

`dry-run` never writes. Mutations without `confirmed=true` return a
`confirmation_required` proposal. `relate`, `log`, `index`, `source_link` and
multi-file actions remain `non_atomic_action`.

## Repository Map

- `src/cli/`: CLI entrypoint.
- `src/mcp/`: MCP stdio server.
- `src/actions/`: shared action surface used by CLI and MCP.
- `src/wiki/`: Markdown wiki workspace implementation.
- `schemas/`: portable JSON Schemas.
- `docs/`: architecture, data model, CLI and MCP documentation.
- `agents/`: agent definitions and registry; `skills/`: skill packs and runtime contracts.
- `examples/minimal-workspace/`: compact runnable workspace/wiki example.

## Verification

```bash
npm run typecheck
npm test
npm run build
```
# Ruta Core estructurada

T.H.O.T.H. mantiene sus comandos CLI y herramientas MCP existentes. La ruta
nueva y provider-agnostic permite planificar y ejecutar intents JSON mediante
`thoth core plan --input '<json>'` y `thoth core execute --input '<plan>'
[--confirmed]`, o MCP `core_plan`/`core_execute`. Las escrituras siempre exigen
confirmación; las consultas son progresivas y limitadas.
