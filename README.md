# T.H.O.T.H.

**Transversal Heuristic Organizer of Trusted History**

T.H.O.T.H. is a local memory system for turning scattered information into a durable **LLM Wiki**: Markdown documents with YAML frontmatter, relations, derived indexes, CLI operations, and an MCP server for LLM clients.

The current MVP is local-first. Markdown is the source of truth. `.thoth/index.json` and `.thoth/relations.json` are derived and can be regenerated.

## Status

Usable local MVP components:

- CLI: `init`, `status`, `list`, `show`, `capture`, `append`, `search`, `index`, `lint`, `update`, `relate`, `doctor`.
- MCP stdio server: tools, resources, and the `capture_memory` prompt.
- JSON Schemas for wiki documents and derived indexes.
- External wiki support via `thoth.config.json`.

## Install For Development

```bash
npm install
npm run build
```

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

Implemented MCP tools:

- `wiki_search`
- `wiki_list`
- `wiki_show`
- `wiki_capture`
- `wiki_update`
- `wiki_relate`
- `wiki_index`
- `wiki_lint`

Implemented MCP resources:

- `thoth://wiki/index`
- `thoth://document/{id}`

Implemented MCP prompts:

- `capture_memory`

## Repository Map

- `src/cli/`: CLI entrypoint.
- `src/mcp/`: MCP stdio server.
- `src/actions/`: shared action surface used by CLI and MCP.
- `src/wiki/`: Markdown wiki workspace implementation.
- `schemas/`: portable JSON Schemas.
- `docs/`: architecture, data model, CLI and MCP documentation.
- `agents/` and `skills/`: future agent and skill contracts.

## Verification

```bash
npm run typecheck
npm test
npm run build
```
