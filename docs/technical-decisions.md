# Technical Decisions

Este documento registra las decisiones tecnicas iniciales de T.H.O.T.H.

Las decisiones pueden evolucionar, pero deben cambiarse de forma explicita y documentada.

## Decision 1: TypeScript First

La primera implementacion de T.H.O.T.H. se hara en TypeScript sobre Node.js.

Motivos:

- buen ecosistema para CLI
- buena integracion con MCP
- soporte maduro para Markdown, YAML, JSON y schemas
- facilidad para prototipar rapido
- distribucion sencilla via npm
- buen encaje con herramientas LLM y flujos de desarrollo actuales

## Decision 2: Portable Contracts

Aunque la primera implementacion sea TypeScript, T.H.O.T.H. no debe quedar acoplado a TypeScript como formato conceptual o de datos.

El proyecto debe poder reimplementarse en Go u otro lenguaje en el futuro.

Para lograrlo:

- los datos persistentes deben ser Markdown, YAML y JSON
- los contratos de herramientas deben documentarse como schemas portables
- CLI y MCP deben usar acciones internas con entradas y salidas estructuradas
- los indices deben ser derivados y regenerables
- las decisiones importantes deben vivir en documentos, no solo en codigo

Principio clave:

```text
TypeScript first, portable by design.
```

## Decision 3: Markdown as Source of Truth

La LLM Wiki basada en archivos sera la fuente de verdad inicial.

Formato principal:

- Markdown para contenido legible
- YAML frontmatter para metadatos
- JSON derivado para indices, relaciones y sesiones

Los indices derivados no deben ser la unica copia de informacion importante.

Si un indice se pierde, debe poder regenerarse desde los documentos Markdown siempre que sea posible.

## Decision 4: No Required Database Initially

T.H.O.T.H. no usara una base de datos obligatoria en la primera version.

Motivos:

- mantener portabilidad
- facilitar inspeccion humana
- permitir versionado con Git
- reducir complejidad inicial
- favorecer compatibilidad futura con Obsidian y herramientas similares

Bases de datos, vector stores o backends remotos podran incorporarse mas adelante como componentes opcionales.

## Decision 5: Derived Indexes

La primera version podra usar indices derivados dentro del workspace.

Estructura posible:

```text
wiki/
  .thoth/
    index.json
    relations.json
    sessions.json
```

Estos archivos serviran para acelerar busquedas, listar documentos, resolver relaciones y mantener continuidad de sesion.

No deben reemplazar a los documentos Markdown como fuente principal.

## Decision 6: MCP over stdio

La primera integracion MCP deberia usar transporte stdio.

Motivos:

- es el patron comun para agentes MCP locales
- evita exponer puertos innecesarios
- facilita integracion con herramientas LLM compatibles
- mantiene el sistema simple y local-first

HTTP puede considerarse mas adelante si existen necesidades claras como UI, integraciones externas o procesos persistentes.

## Decision 7: CLI as Local Operations Layer

La CLI sera una capa de operacion local, administracion y depuracion.

No sera necesariamente la interfaz principal del usuario final.

Responsabilidades iniciales:

- inicializar workspaces
- validar configuracion
- ejecutar diagnosticos
- regenerar indices
- permitir captura y consulta manual
- iniciar o configurar integracion MCP cuando aplique

El flujo principal seguira siendo conversacional mediante LLM + T.H.O.T.H. Core + MCP tools.

## Decision 8: Shared Internal Actions

CLI y MCP deben compartir las mismas acciones internas.

Ejemplos:

- `capture_knowledge`
- `query_knowledge`
- `list_documents`
- `show_document`
- `update_document`
- `rebuild_index`
- `run_skill`
- `run_agent`

Esto reduce duplicacion y facilita futuras reimplementaciones.

## Decision 9: Future Go Implementation Is Viable

Una version futura en Go es viable si se mantienen contratos portables.

Go podria aportar:

- binario unico
- distribucion simple
- buen rendimiento para CLI
- robustez para indexing, grafos y procesos locales
- similitud conceptual con herramientas como Engram

La version TypeScript debe evitar decisiones que impidan esta posibilidad.

## Decision 10: Graph and RAG as Derived Layers

Grafo y RAG se trataran como capas derivadas, no como requisitos de la primera version.

Orden esperado:

1. Markdown source of truth
2. JSON indexes
3. knowledge graph derivado
4. chunking y embeddings
5. vector search opcional
6. backends opcionales

Esto permite evolucionar sin comprometer la simplicidad inicial.

## Stack Inicial Propuesto

Lenguaje:

- TypeScript

Runtime:

- Node.js

Package manager:

- npm inicialmente

CLI:

- Commander u otra libreria CLI ligera

Tests:

- Vitest

Documentos:

- Markdown
- YAML frontmatter

Schemas:

- JSON Schema cuando aporte claridad

MCP:

- SDK oficial o compatible de Model Context Protocol

Distribucion:

- paquete npm instalable globalmente

## Direccion Inicial

La primera implementacion debe priorizar:

1. estructura TypeScript minima
2. lectura y escritura de archivos Markdown
3. validacion basica de frontmatter
4. generacion de IDs y rutas
5. comandos CLI minimos
6. acciones internas compartidas
7. preparacion para MCP stdio

El objetivo es validar el nucleo antes de incorporar agentes complejos, skills avanzadas, grafo o RAG.
