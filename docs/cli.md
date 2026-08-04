# CLI

La CLI sera la primera capa operativa local de T.H.O.T.H.

Su objetivo es permitir que una persona pueda instalar, inicializar, administrar y depurar un workspace T.H.O.T.H. desde terminal.

El flujo principal de uso no sera necesariamente escribir comandos manuales. T.H.O.T.H. esta pensado para actuar dentro de conversaciones con un LLM, usando una capa de herramientas como MCP para capturar, consultar y actualizar conocimiento.

La CLI y MCP deben compartir las mismas acciones internas, pero orientadas a contextos distintos: la CLI para operacion local y MCP para uso conversacional.

## Objetivos

- ofrecer una forma simple de administrar T.H.O.T.H. localmente
- permitir flujos manuales de captura y consulta cuando sean necesarios
- mantener la wiki en archivos legibles
- servir como herramienta de instalacion, diagnostico y depuracion
- compartir acciones internas con la futura capa MCP
- validar el modelo de datos antes de construir interfaces mas complejas

## Principios

- **Comandos claros:** cada comando debe hacer una cosa principal.
- **Salida legible:** la respuesta debe ser util para humanos y facil de procesar por herramientas.
- **Sin bloqueo innecesario:** los flujos comunes deben requerir pocos pasos.
- **Compatibilidad local:** la primera version debe funcionar con archivos en disco.
- **Paridad con MCP:** las acciones relevantes deben poder exponerse tambien como herramientas MCP.
- **Evolucion incremental:** los comandos pueden empezar simples y crecer con opciones concretas.

## Relacion con MCP

T.H.O.T.H. debe poder operar dentro de una conversacion con un LLM.

En ese escenario, el usuario habla con el LLM y el agente maestro decide cuando invocar herramientas para guardar, consultar, actualizar o relacionar conocimiento.

La CLI no sustituye ese flujo. Lo complementa.

Distribucion de responsabilidades:

- **LLM conversation:** interfaz principal para el usuario.
- **T.H.O.T.H. Core:** interpreta intencion, coordina agentes y decide acciones.
- **MCP/tools:** expone operaciones seguras al LLM.
- **CLI:** instala, inicializa, administra, depura y permite uso manual.
- **LLM Wiki:** almacena el conocimiento persistente.

Ejemplo de flujo conversacional:

```text
Usuario: Guarda esto como parte del lore del proyecto X.
LLM/T.H.O.T.H.: analiza el contenido y decide como clasificarlo.
MCP tool: capture_knowledge(...)
LLM Wiki: se actualiza.
LLM/T.H.O.T.H.: confirma que se ha guardado y resume donde quedo almacenado.
```

Ejemplo de uso CLI equivalente:

```bash
thoth capture --type note --project project-x --file lore.md
```

## Comandos Iniciales

### thoth init

Inicializa un workspace T.H.O.T.H. en el directorio actual.

Ejemplo:

```bash
thoth init
```

Responsabilidades:

- crear la estructura base de la wiki
- crear un archivo de configuracion inicial
- crear o actualizar `wiki/index.md`
- validar que no se sobrescriban datos existentes sin confirmacion

Estructura inicial:

```text
wiki/
  index.md
  projects/
  notes/
  ideas/
  decisions/
  research/
  sources/
  entities/
  timelines/
thoth.config.json
```

### thoth capture

Captura informacion nueva y la transforma en una pagina de la LLM Wiki.

Ejemplos:

```bash
thoth capture "Idea para un sistema de agentes personales"
thoth capture --type idea "Crear una skill para resumir reuniones"
thoth capture --file notes/session.md
thoth capture --type note --title "Nota importante" --tag cli "Contenido a guardar"
```

Responsabilidades:

- recibir texto directo o contenido desde archivo
- detectar o aceptar el tipo de documento
- generar metadatos iniciales
- crear una pagina Markdown con frontmatter YAML
- actualizar el indice cuando sea necesario
- evitar sobrescribir documentos existentes
- rechazar `--type source`; las fuentes raw se crean con `thoth source add`

Opciones iniciales:

- `--type`: tipo de documento
- `--title`: titulo explicito
- `--tags`: etiquetas separadas por coma
- `--tag`: etiqueta repetible
- `--file`: archivo de entrada
- `--project`: proyecto al que pertenece

La primera implementacion soporta texto directo y `--tag` repetible. `--file`, `--project` y clasificacion automatica quedan para fases posteriores.

### thoth list

Lista documentos existentes en la wiki.

Ejemplos:

```bash
thoth list
thoth list --type idea
thoth list --tag cli
```

Responsabilidades:

- mostrar documentos por tipo, estado o tag
- incluir id, titulo, tipo, estado y fecha de actualizacion
- permitir una vista rapida del contenido disponible

Opciones iniciales:

- `--type`
- `--status`
- `--tag`
- `--recent`

### thoth source

Administra fuentes raw conservadas como documentos `type: source` en `sources/`.

Ejemplos:

```bash
thoth source add "Transcripcion o material sin procesar" --title "Interview Alpha" --tag raw
thoth source list
thoth source show source-interview-alpha
thoth source link source-interview-alpha note-derived-context
```

Subcomandos iniciales:

- `source add <content> --title <title>`: crea una fuente raw; acepta `--status`, `--tag` repetible y `--id source-<slug>`.
- `source list`: lista documentos de tipo `source`.
- `source show <id>`: muestra una fuente usando la lectura normal de documentos.
- `source link <source-id> <document-id>`: valida que el primer documento sea `type: source` y crea relaciones idempotentes `source_for` y `derived_from`, incluyendo enlaces Markdown.

### thoth show

Muestra una pagina concreta de la wiki.

Ejemplo:

```bash
thoth show project-thoth
```

Responsabilidades:

- localizar un documento por `id`
- imprimir su contenido en formato legible
- mostrar metadatos relevantes

Opciones iniciales:

- `--raw`: muestra el Markdown completo
- `--summary`: muestra solo resumen y metadatos principales

### thoth search

Busca informacion dentro de la wiki.

Ejemplos:

```bash
thoth search "agentes especializados"
thoth search "lore" --type note
```

Responsabilidades:

- buscar por texto en documentos Markdown
- permitir filtros basicos por tipo o tag
- devolver coincidencias con id, titulo y ruta
- generar snippets simples para ubicar la coincidencia

En versiones futuras podra evolucionar hacia busqueda semantica.

### thoth index

Regenera el indice de la wiki.

Ejemplo:

```bash
thoth index
```

Responsabilidades:

- leer documentos existentes
- validar metadatos minimos
- actualizar `wiki/index.md`
- detectar documentos sin relaciones, tags o resumen
- generar `.thoth/index.json`
- generar `.thoth/relations.json`
- advertir sobre relaciones rotas o IDs duplicados

### thoth lint

Audita la consistencia de documentos Markdown sin modificar la wiki.

Ejemplo:

```bash
thoth lint
```

Responsabilidades:

- validar frontmatter minimo
- detectar IDs duplicados
- detectar relaciones rotas
- devolver codigo de salida no-cero cuando hay issues

### thoth update

Actualiza metadatos simples de un documento existente.

Ejemplos:

```bash
thoth update project-thoth --status active
thoth update note-example --title "Nuevo titulo" --tag reviewed
```

Responsabilidades:

- localizar documentos por `id`
- actualizar `title`, `type` o `status`
- rechazar conversiones hacia o desde `type: source`; las fuentes raw se crean con `thoth source add`
- agregar tags sin duplicarlos
- actualizar `updated_at`
- conservar el cuerpo Markdown del documento

### thoth append

Agrega contenido a una seccion de un documento existente.

Ejemplo:

```bash
thoth append project-thoth "Nueva observacion" --section Notes
```

Responsabilidades:

- localizar documentos por `id`
- agregar contenido a una seccion existente
- crear la seccion si no existe
- actualizar `updated_at`
- preservar frontmatter y cuerpo existente

### thoth log

Agrega una entrada al log global y, opcionalmente, a la timeline de un proyecto.

Ejemplos:

```bash
thoth log "Primera nota durable"
thoth log "Milestone alcanzado" --kind decision --project project-thoth
thoth log "Detalle con referencia" --ref note-example
```

Responsabilidades:

- escribir en `log.md` global (append-only) una entrada con prefijo parseable `## [YYYY-MM-DD] <kind> | <resumen>`
- aceptar `--kind` del catalogo de tipos de log (`implementation`, `decision`, `discovery`, `structure`, `fix`, `environment`, `correction`, `verification`, `maintenance`, `version`, `log`)
- con `--project <id>`, validar que el proyecto exista y escribir la misma entrada en `timelines/timeline-<project-id>.md` con relacion `belongs_to`
- con `--ref <id>`, anadir un bullet `- Reference: [[<id>]]` a la entrada
- imprimir la ruta global, la ruta de timeline si aplica y el id de proyecto

### thoth relate

Crea una relacion explicita entre dos documentos existentes.

Ejemplo:

```bash
thoth relate project-thoth implementation-index-cli --relation has_implementation
```

Responsabilidades:

- validar que el documento fuente exista
- validar que el documento destino exista
- validar que la relacion exista en el catalogo semantico (`has_implementation`, `derived_from`, etc.)
- agregar una entrada a `related`
- evitar relaciones duplicadas
- actualizar `updated_at` del documento fuente

### thoth doctor

Diagnostica el workspace y la wiki configurada.

Ejemplo:

```bash
thoth doctor
```

Responsabilidades:

- confirmar que la configuracion carga
- confirmar que la wiki existe
- confirmar estructura de directorios requerida
- ejecutar lint
- regenerar indices derivados como comprobacion
- mostrar version CLI/MCP
- devolver codigo no-cero si algun check falla

### thoth skill

Lista o ejecuta skills disponibles.

Ejemplos:

```bash
thoth skill list
thoth skill run summarize --file notes/session.md
```

Responsabilidades:

- descubrir skills instaladas
- mostrar descripcion y parametros
- ejecutar una skill con entrada explicita
- devolver resultados estructurados

### thoth agent

Lista o ejecuta agentes disponibles.

Ejemplos:

```bash
thoth agent list
thoth agent run archivist --file notes/session.md
```

Responsabilidades:

- descubrir agentes disponibles
- mostrar su funcion
- ejecutar agentes de forma controlada
- permitir que T.H.O.T.H. Core los invoque en flujos futuros

## Flujo Minimo Viable CLI

El primer prototipo de CLI deberia permitir administrar un workspace local y validar que las acciones internas funcionan correctamente:

```bash
thoth init
thoth status
thoth capture --type idea --title "LLM Wiki" "Crear una wiki optimizada para humanos y modelos de lenguaje"
thoth list
thoth show idea-llm-wiki
```

Este flujo valida las piezas mas importantes:

- creacion de workspace
- captura de informacion
- escritura de una pagina wiki
- lectura de documentos existentes
- consulta por id

Este flujo manual debe servir tambien como base para definir herramientas MCP equivalentes.

## Configuracion

La CLI debe usar un archivo `thoth.config.json` en la raiz del workspace.

`wikiPath` define donde vive la LLM Wiki. Puede apuntar a una carpeta dentro o fuera del repositorio. En el workspace actual de desarrollo de T.H.O.T.H., la wiki vive fuera del repo y se referencia como `../wiki`.

Configuracion inicial propuesta:

```json
{
  "wikiPath": "../wiki",
  "defaultType": "note",
  "defaultStatus": "draft",
  "dateFormat": "YYYY-MM-DD"
}
```

## Comandos de Administracion

Ademas de los comandos de captura y consulta, la CLI debe incluir comandos orientados a instalacion y operacion local.

### thoth status

Muestra el estado del workspace.

Ejemplo:

```bash
thoth status
```

Responsabilidades:

- comprobar si el workspace esta inicializado
- mostrar ruta de la wiki
- contar documentos indexados
- detectar problemas basicos de configuracion

### thoth mcp

Administra la integracion MCP.

Ejemplos:

```bash
thoth mcp start
thoth mcp status
```

Responsabilidades:

- iniciar un servidor MCP local cuando aplique
- exponer herramientas para uso conversacional
- comprobar disponibilidad de herramientas
- facilitar integracion con clientes LLM compatibles

## Errores Iniciales

La CLI debe manejar claramente estos casos:

- workspace no inicializado
- documento no encontrado
- tipo de documento no valido
- frontmatter invalido
- archivo de entrada inexistente
- intento de sobrescribir archivos existentes

## Direccion Inicial

La primera implementacion debe centrarse en comandos locales, sin depender todavia de modelos de lenguaje externos.

El objetivo inicial es validar estructura, almacenamiento, lectura y escritura. Esa misma base debera poder exponerse despues mediante MCP para que T.H.O.T.H. opere de forma natural dentro de conversaciones con LLMs.
