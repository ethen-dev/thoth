# MCP

T.H.O.T.H. expone un servidor MCP stdio (`thoth-mcp`) que opera sobre la wiki
configurada en `thoth.config.json`. La superficie real es la siguiente.

## Tools implementadas

| Tool | Parámetros |
| --- | --- |
| `wiki_search` | `query`; opcionales `type`, `status`, `tag` |
| `wiki_list` | opcionales `type`, `status`, `tag` |
| `wiki_show` | `id`; `mode`: `content`, `metadata` o `raw` |
| `wiki_capture` | `content`; opcionales `title`, `type`, `status`, `tags` (array), `projectId` |
| `wiki_update` | `id`; opcionales `title`, `type`, `status`, `tags` (array) |
| `wiki_relate` | `sourceId`, `targetId`, `relation` |
| `wiki_index` | sin parámetros |
| `wiki_lint` | sin parámetros |
| `wiki_log` | `content`; opcionales `kind`, `project`, `ref` |

`wiki_capture` no acepta fuentes (`type: source`); se crean con `source add`
en la CLI. Para `type: task`, `projectId` debe identificar un proyecto
existente. `tags` es un array, mientras que `tag` es el filtro de búsqueda y
listado. `wiki_log` escribe el log global y opcionalmente la timeline del
proyecto.

Los tipos documentales válidos son `project`, `note`, `idea`, `decision`,
`implementation`, `session`, `log`, `research`, `source`, `entity`,
`character`, `chapter`, `timeline`, `reference` y `task`; `wiki_capture`
admite los mismos valores excepto `source`. Las relaciones válidas son
`belongs_to`, `mentions`, `depends_on`, `continues`, `contradicts`, `supports`,
`references`, `related_to`, `has_note`, `has_decision`, `has_implementation`,
`derived_from`, `source_for`, `supersedes`, `applies_to`, `updates`,
`complements`, `refines`, `extends`, `follows`, `implements`, `fixes`,
`parallels`, `verifies`, `documents`, `has_log`, `has_subarea` y
`has_verification`. Los tipos de log válidos son `implementation`,
`decision`, `discovery`, `structure`, `fix`, `environment`, `correction`,
`verification`, `maintenance`, `version` y `log`.

## Resources y prompt

Resources implementados:

- `thoth://wiki/index`
- `thoth://document/{id}`

Prompt implementado:

- `capture_memory`, con argumentos `content` e `intent` opcional.

Resources proporcionan Markdown; el prompt guía el flujo de captura. No son
tools ni agentes ejecutables.

## Configuración

La configuración de clientes está en `docs/mcp-configuration.md`. El servidor
comparte las acciones de la CLI y funciona sobre archivos locales, sin una
base de datos obligatoria.

Las APIs conceptuales como `capture_knowledge`, `query_knowledge`,
`list_documents`, `show_document`, `update_document`, `rebuild_index`,
`run_skill` o `run_agent` son diseños futuros, no nombres de tools actuales.
# Skill tools

The MCP server exposes `skill_list`, `skill_show`, `skill_validate`, and
`skill_run`, backed by the same runtime as the CLI. `skill_run` accepts
`skillId`, `input`, and `mode` (`validate` or `execute`). Only `wiki-query`
and `wiki-lint` execute; other skills return structured `unsupported` results.
Markdown bodies and frontmatter commands are never run.

`skill_run` uses the same inputs and outputs as the CLI: `wiki-query` accepts
`query`, optional `type`, `status`, and `tag`; `wiki-lint` accepts `{}`.
Query outputs are summaries only and omit full content, raw Markdown, and
metadata.
Snippets are whitespace-normalized and limited to 500 characters.
