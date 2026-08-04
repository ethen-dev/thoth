# MCP Configuration

`thoth-mcp` is a stdio MCP server. It resolves the wiki path from
`thoth.config.json`. Keeping that file in the server's `cwd` is recommended,
but it is not required: configuration can also be selected with
`THOTH_CONFIG`, or resolved through the supported global fallback at
`~/Documents/Thoth/workspace/thoth.config.json`.

## Prerequisites

Build the project first when running from a local checkout:

```bash
npm install
npm run build
```

Verify the server binary:

```bash
node dist/mcp/server.js --version
```

## Local Checkout Configuration

Use this shape for clients that support `command`, `args`, and `cwd`:

```json
{
  "mcpServers": {
    "thoth": {
      "command": "node",
      "args": ["dist/mcp/server.js"],
      "cwd": "/absolute/path/to/thoth-workspace"
    }
  }
}
```

The recommended `cwd` directory contains `thoth.config.json`:

```json
{
  "wikiPath": "../wiki"
}
```

## Claude Desktop Example

For Claude Desktop, add a server entry similar to this in the app MCP configuration file:

```json
{
  "mcpServers": {
    "thoth": {
      "command": "node",
      "args": ["/absolute/path/to/thoth/dist/mcp/server.js"],
      "cwd": "/absolute/path/to/thoth"
    }
  }
}
```

If T.H.O.T.H. is installed globally or linked with npm, the command can be:

```json
{
  "mcpServers": {
    "thoth": {
      "command": "thoth-mcp",
      "args": [],
      "cwd": "/absolute/path/to/workspace-with-thoth-config"
    }
  }
}
```

## Exposed Surface

Tools:

- `wiki_search`
- `wiki_list`
- `wiki_show`
- `wiki_capture`
- `wiki_update`
- `wiki_relate`
- `wiki_index`
- `wiki_lint`
- `wiki_log`

Resources:

- `thoth://wiki/index`
- `thoth://document/{id}`

Prompts:

- `capture_memory`

Alternatively, point the client process at a configuration file explicitly:

```bash
THOTH_CONFIG=/absolute/path/to/thoth.config.json thoth-mcp
```

## Troubleshooting

- If tools fail with config errors, check `THOTH_CONFIG`, `cwd`, and the global
  fallback path.
- If schema lint fails after install, verify that the package includes `schemas/`.
- If the process exits immediately, run `node dist/mcp/server.js --version` from the same `cwd`.
