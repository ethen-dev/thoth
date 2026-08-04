# Data Model

La LLM Wiki de T.H.O.T.H. debe almacenar conocimiento en archivos legibles por humanos y faciles de procesar por modelos de lenguaje.

El formato inicial sera **Markdown con frontmatter YAML**. Esto permite combinar metadatos estructurados con contenido narrativo claro.

## Objetivos

- guardar informacion de forma persistente
- mantener documentos faciles de leer y editar
- permitir busqueda, clasificacion y consulta por LLMs
- representar relaciones entre piezas de conocimiento
- facilitar la evolucion hacia indices, embeddings o almacenamiento remoto

## Pagina Wiki

Cada pagina de la LLM Wiki representa una unidad de conocimiento.

Una pagina debe contener:

- metadatos estructurados
- resumen breve
- contenido principal
- relaciones relevantes
- trazabilidad minima

## Frontmatter

Cada pagina debe empezar con un bloque YAML.

El contrato portable inicial vive en `schemas/wiki-document.schema.json`.

Campos iniciales:

```yaml
---
id: note-2026-08-02-001
title: Example Note
type: note
status: draft
created_at: 2026-08-02
updated_at: 2026-08-02
tags:
  - example
  - thoth
source: manual
related:
  - id: project-thoth
    relation: belongs_to
---
```

## Campos

### id

Identificador unico y estable del documento.

Debe ser legible y no depender solo del titulo, ya que el titulo puede cambiar.

### title

Nombre humano del documento.

Debe ser claro, descriptivo y facil de reconocer.

### type

Tipo de documento dentro de la wiki.

Tipos iniciales:

- `project`
- `note`
- `idea`
- `decision`
- `implementation`
- `session`
- `log`
- `research`
- `source`
- `entity`
- `character`
- `chapter`
- `timeline`
- `reference`

El lint y las operaciones de escritura rechazan tipos fuera de este catalogo para mantener portabilidad.

### status

Estado actual del documento.

Estados iniciales:

- `draft`
- `active`
- `review`
- `archived`

### created_at

Fecha de creacion del documento.

### updated_at

Fecha de ultima modificacion relevante.

### tags

Etiquetas libres para clasificar y localizar informacion.

### source

Origen principal del contenido.

Valores iniciales:

- `manual`
- `conversation`
- `file`
- `import`
- `generated`
- `raw`

Los documentos con `type: source` representan fuentes raw y normalmente usan `source: raw`.

### related

Lista de relaciones con otros documentos.

Cada relacion debe indicar el `id` del documento relacionado y el tipo de relacion.

## Relaciones

Las relaciones permiten que la wiki funcione como una red de conocimiento, no como un conjunto de archivos aislados.

El contrato portable inicial vive en `schemas/wiki-relation.schema.json`.

Relaciones iniciales:

- `belongs_to`: pertenece a otro documento o proyecto
- `mentions`: menciona una entidad, idea o documento
- `depends_on`: depende de otro documento
- `continues`: continua un documento previo
- `contradicts`: contradice o entra en conflicto con otro documento
- `supports`: apoya o refuerza otra informacion
- `references`: referencia otro documento o fuente
- `related_to`: relacion generica cuando no aplica un tipo mas especifico
- `has_note`: contiene o agrupa una nota relacionada
- `has_decision`: contiene o agrupa una decision relacionada
- `has_implementation`: contiene o agrupa una implementacion relacionada
- `derived_from`: deriva de una fuente o documento previo
- `source_for`: indica que un documento `source` sirve como fuente raw para otro documento
- `supersedes`: reemplaza o deja obsoleto un documento previo
- `applies_to`: aplica a un documento, area o contexto especifico
- `updates`: actualiza informacion previa
- `complements`: complementa informacion relacionada
- `refines`: precisa o mejora informacion previa
- `extends`: extiende el alcance de otro documento
- `follows`: sigue una secuencia o trabajo previo
- `implements`: implementa una decision, especificacion o plan
- `fixes`: corrige un problema identificado
- `parallels`: describe una linea paralela de trabajo o conocimiento
- `verifies`: verifica una afirmacion, implementacion o resultado
- `documents`: documenta un componente, decision o proceso
- `has_log`: contiene o agrupa un log relacionado
- `has_subarea`: contiene o agrupa una subarea relacionada
- `has_verification`: contiene o agrupa una verificacion relacionada

Restricciones semanticas minimas:

- `source_for` debe originarse en un documento con `type: source`.
- `derived_from` puede apuntar a una fuente o a un documento previo no-source.
- `capture` no crea documentos `source`; `update --type` no convierte documentos a `source` ni cambia documentos `source` a otro tipo; usa `source add` para crear fuentes raw.
- El lint reporta tipos y relaciones fuera de catalogo, y las operaciones `capture`, `update` y `relate` los rechazan.

## Estructura de Contenido

Despues del frontmatter, una pagina debe usar secciones simples y predecibles.

Estructura recomendada:

```markdown
# Title

## Summary

Resumen breve del contenido y su relevancia.

## Content

Contenido principal del documento.

## Context

Informacion contextual necesaria para interpretar correctamente el documento.

## Relations

Explicacion humana de relaciones importantes si hace falta.

## Notes

Observaciones, dudas o puntos pendientes.
```

No todas las secciones seran obligatorias para todos los tipos de documento, pero `Summary` y `Content` deberian existir siempre que sea posible.

## Organizacion de Archivos

Estructura inicial propuesta para una wiki local:

```text
wiki/
  index.md
  projects/
  notes/
  ideas/
  decisions/
  implementation/
  sessions/
  logs/
  research/
  sources/
  entities/
  timelines/
```

## Taxonomia de Memoria

La wiki debe separar decisiones de implementaciones.

- `decision`: registra una decision conceptual, arquitectonica o de producto.
- `implementation`: registra que se implemento, como se hizo, archivos tocados y verificacion.
- `session`: cristaliza una conversacion o bloque de trabajo.
- `log`: mantiene un registro cronologico por sesion o bloque de trabajo.

No se deben guardar implementaciones como decisiones salvo que la implementacion sea en si misma una decision arquitectonica.

Los logs deben vivir en `logs/` como archivos separados por sesion. Evitar un unico `log.md` global salvo que exista una necesidad concreta de indice agregado.

La organizacion por carpetas debe ayudar a navegar manualmente, pero el sistema no debe depender solo de la ruta. Los metadatos deben ser la fuente principal para clasificar documentos.

Los documentos `source` viven en `sources/` y preservan contenido raw con una seccion `Raw Source`. Para enlazarlos a conocimiento procesado, `source link` crea la relacion `source_for` desde la fuente al documento derivado y `derived_from` en sentido inverso.

Los proyectos complejos pueden usar subdirectorios dentro de `projects/` para agrupar subareas relacionadas. Por ejemplo, `projects/thoth/project-thoth.md` puede actuar como raiz y `projects/thoth/mcp.md`, `projects/thoth/cli.md` o `projects/thoth/agents.md` como subdocumentos relacionados mediante `related`.

Este patron evita saturar la lista global de proyectos y mantiene juntas las piezas duraderas de un mismo proyecto.

## Indice

El indice debe permitir localizar documentos y entender relaciones generales.

Inicialmente puede ser un archivo `wiki/index.md` generado o mantenido por T.H.O.T.H.

Los indices derivados JSON usan `schemas/wiki-index.schema.json` y `schemas/wiki-relations-index.schema.json`.

El indice puede incluir:

- listado de documentos por tipo
- documentos recientes
- tags principales
- relaciones importantes
- proyectos activos
- documentos pendientes de revision

## Ejemplo

```markdown
---
id: project-thoth
title: T.H.O.T.H.
type: project
status: active
created_at: 2026-08-02
updated_at: 2026-08-02
tags:
  - llm-wiki
  - agents
  - cli
source: manual
related: []
---

# T.H.O.T.H.

## Summary

T.H.O.T.H. es un sistema para convertir informacion dispersa en conocimiento estructurado, persistente y consultable.

## Content

El proyecto define un agente maestro, agentes especializados, skills, una CLI y una LLM Wiki para almacenar y recuperar conocimiento de forma modular.

## Context

El sistema debe poder adaptarse a proyectos, ideas, documentacion, lore, capitulos, investigaciones y otros materiales de trabajo.

## Relations

Este documento actua como raiz conceptual del proyecto.

## Notes

Pendiente definir arquitectura tecnica, comandos CLI y primeras skills.
```

## Direccion Inicial

La primera implementacion debe priorizar documentos Markdown simples con frontmatter YAML valido, IDs estables y una estructura de carpetas clara.

El modelo debe crecer solo cuando existan necesidades concretas del sistema, la CLI o los agentes.
