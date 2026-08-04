# CLI

La CLI opera el workspace local configurado por `thoth.config.json`. La wiki
usa Markdown como fuente de verdad; los índices son derivados.

## Comandos implementados

### Workspace

- `thoth init`: crea la wiki configurada, sus directorios requeridos,
  `index.md` y `log.md` si no existen. No sobrescribe esos archivos.
- `thoth status`: muestra workspace, configuración, ruta de wiki, existencia
  de la wiki y del índice, y directorios ausentes.
- `thoth doctor`: comprueba configuración, estructura, lint, índices y
  versiones CLI/MCP.

### Documentos

- `thoth list [--type <type>] [--status <status>] [--tag <tag>]`
- `thoth show <id> [--raw|--metadata]`
- `thoth capture <content> [--type <type>] [--title <title>] [--status <status>] [--project <id>] [--tag <tag>]...`
- `thoth append <id> <content> [--section <section>]` (por defecto,
  `Notes`).
- `thoth search <query> [--type <type>] [--status <status>] [--tag <tag>]`
- `thoth update <id> [--title <title>] [--type <type>] [--status <status>] [--tag <tag>]...`
- `thoth relate <source> <target> --relation <relation>`

Las relaciones válidas son: `belongs_to`, `mentions`, `depends_on`,
`continues`, `contradicts`, `supports`, `references`, `related_to`,
`has_note`, `has_decision`, `has_implementation`, `derived_from`,
`source_for`, `supersedes`, `applies_to`, `updates`, `complements`, `refines`,
`extends`, `follows`, `implements`, `fixes`, `parallels`, `verifies`,
`documents`, `has_log`, `has_subarea` y `has_verification`.

`capture` recibe contenido textual directo; no implementa `--file` ni
`--tags`, y las fuentes no se capturan con `--type source`. Las tareas
requieren `--project` y un proyecto existente. `show` ofrece `--raw` y
`--metadata`; no existe `--summary`.

Los tipos documentales válidos son: `project`, `note`, `idea`, `decision`,
`implementation`, `session`, `log`, `research`, `source`, `entity`,
`character`, `chapter`, `timeline`, `reference` y `task`. `capture` admite
todos excepto `source`; usa `source add` para fuentes raw.

### Logs

`thoth log <content> [--kind <kind>] [--project <id>] [--ref <id>]` añade una
entrada a `log.md` y, si se indica proyecto, a su timeline. `--ref` añade una
referencia Markdown. Los tipos de log válidos son `implementation`,
`decision`, `discovery`, `structure`, `fix`, `environment`, `correction`,
`verification`, `maintenance`, `version` y `log`.

### Índices y enlaces

- `thoth index [--human] [--curated] [--category-pages] [--type <type>] [--max-per-section <n>]`
  regenera índices derivados. Las opciones adicionales requieren `--human`.
- `thoth lint` valida documentos e índices sin modificar la wiki.
- `thoth sync-links` sincroniza enlaces Markdown desde `related` del
  frontmatter.

### Fuentes raw

- `thoth source add <content> --title <title> [--id <id>] [--status <status>] [--tag <tag>]...`
- `thoth source list [--status <status>] [--tag <tag>]`
- `thoth source show <id> [--raw|--metadata]`
- `thoth source link <source-id> <document-id>`

Las fuentes viven en `sources/`, con `type: source`; `source link` crea las
relaciones `source_for` y `derived_from` de forma idempotente.

### Agents

`thoth agents` administra el registro, no ejecuta agentes:

- `thoth agents list [--source internal|external] [--category <category>]`
- `thoth agents show <id>`
- `thoth agents register <path>`
- `thoth agents unregister <id>`
- `thoth agents validate`

Los agentes internos y externos declaran un runtime (`opencode`, `prompt` o
`external`). Las skills siguen siendo contratos/documentación futura; no
existe `thoth skill`.

## Ejemplo mínimo

```bash
thoth init
thoth capture "Una nota durable" --type note --title "Nota"
thoth list
thoth show note-una-nota-durable
thoth append note-una-nota-durable "Más contexto" --section Notes
thoth log "Nota registrada" --kind discovery
thoth index
thoth lint
```

Los comandos hipotéticos `thoth agent` (singular) y `thoth mcp`, así como
flags o comandos no listados aquí, son futuros y no forman parte de la CLI
actual.
