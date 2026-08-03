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
- `entity`
- `character`
- `chapter`
- `timeline`
- `reference`

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

### related

Lista de relaciones con otros documentos.

Cada relacion debe indicar el `id` del documento relacionado y el tipo de relacion.

## Relaciones

Las relaciones permiten que la wiki funcione como una red de conocimiento, no como un conjunto de archivos aislados.

Relaciones iniciales:

- `belongs_to`: pertenece a otro documento o proyecto
- `mentions`: menciona una entidad, idea o documento
- `depends_on`: depende de otro documento
- `continues`: continua un documento previo
- `contradicts`: contradice o entra en conflicto con otro documento
- `supports`: apoya o refuerza otra informacion
- `derived_from`: deriva de una fuente o documento previo

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

## Indice

El indice debe permitir localizar documentos y entender relaciones generales.

Inicialmente puede ser un archivo `wiki/index.md` generado o mantenido por T.H.O.T.H.

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
