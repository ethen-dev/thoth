# MCP

T.H.O.T.H. expone un servidor MCP stdio (`thoth-mcp`) que opera sobre la wiki
configurada en `thoth.config.json`. La superficie real es la siguiente.

## Tools implementadas

| Tool | Parámetros |
| --- | --- |
| `wiki_search` | `query`; opcionales `type`, `status`, `tag`, `limit` (1-20, por defecto 20) |
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
tools ni agentes ejecutables. `wiki_show` y los resources pueden devolver
intencionalmente `content`, `raw` o `metadata` bajo demanda; la restricción de
resúmenes aplica a `wiki_search`, `wiki-query` y la query del Core.

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
`skillId`, `input`, `mode` (`validate`, `plan`, `dry-run` or `execute`) and
optional `confirmed`. LLM skills require a provider injected through the API;
CLI/MCP expose the contract but do not discover one. The adapter is trusted,
not a sandbox. Shell, Markdown bodies, and implicit providers are never run.

`skill_run` uses the same inputs and outputs as the CLI: `wiki-query` accepts
`query`, optional `type`, `status`, and `tag`; `wiki-lint` accepts `{}`.
Query outputs are summaries only and omit full content, raw Markdown, and
metadata.
Snippets are whitespace-normalized and limited to 500 characters.
# Core estructurado

Además de las herramientas MCP existentes, el servidor expone `core_plan` y
`core_execute`. Ambas reutilizan el runtime del Core y aceptan los contratos
JSON `IntentRequest` y `ThothPlan`; los planes malformados producen un resultado
estructurado `invalid_input` y no una excepción de despacho. Las escrituras
requieren `confirmed: true`. `query` solo devuelve búsqueda resumida; `show` es
un intent explícito que requiere un id seleccionado.

Esta es la ruta estructurada provider-agnostic: los writes requieren
confirmación y las acciones no atómicas se rechazan. Las tools MCP legacy
siguen existiendo por compatibilidad y aún no están migradas al Core; el Core
no constituye una garantía global sobre todas las tools.

`wiki_search` es una superficie legacy independiente del Core: devuelve
resultados resumidos, acepta `limit` opcional y aplica máximo 20 (por defecto
20). El Core rechaza acciones multiarchivo sin transacción.
Las herramientas MCP antiguas siguen existiendo.
