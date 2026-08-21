# Roadmap

Este roadmap define una evolucion incremental para T.H.O.T.H., desde una LLM Wiki basada en archivos hasta un sistema con indices, grafos y RAG.

La decision inicial es evitar una base de datos obligatoria. Los archivos Markdown deben actuar como fuente de verdad, mientras que indices, grafos y embeddings pueden generarse como artefactos derivados.

## Fase 1: File-Based LLM Wiki

Objetivo: construir una memoria local simple, legible y usable sin base de datos.

Capacidades:

- workspace local con `wiki/`
- documentos Markdown con frontmatter YAML
- IDs estables
- tipos de documento iniciales
- relaciones declaradas en metadatos
- log global append-only (`log.md`) y timelines por proyecto en `timelines/`
- CLI basica para inicializar, capturar, listar y mostrar documentos
- MCP basico para captura y consulta desde conversaciones LLM

Resultado esperado:

```text
wiki/
  index.md
  projects/
  notes/
  ideas/
  decisions/
  research/
  entities/
  timelines/
```

## Fase 2: Indices Derivados

Objetivo: mejorar busqueda, trazabilidad y rendimiento sin cambiar la fuente de verdad.

Capacidades:

- `index.json` derivado de documentos Markdown
- `relations.json` derivado de relaciones declaradas
- `sessions.json` para resumenes y continuidad conversacional
- busqueda textual local
- validacion de frontmatter
- deteccion simple de duplicados
- soporte inicial para topic keys

Estructura posible:

```text
wiki/
  .thoth/
    index.json
    relations.json
    sessions.json
```

Los archivos dentro de `.thoth/` deben poder regenerarse a partir de la wiki siempre que sea posible.

## Fase 3: Grafo de Conocimiento

Objetivo: representar documentos, entidades y relaciones como un grafo navegable.

Modelo conceptual:

- documentos como nodos
- entidades como nodos
- relaciones como aristas
- tags como agrupadores
- proyectos como subgrafos

```mermaid
flowchart LR
  Project[project/thoth] --> Decision[decision/no-database-initially]
  Project --> Architecture[architecture/mcp-layer]
  Architecture --> MCP[MCP Tools]
  Decision --> Wiki[File-Based LLM Wiki]
  Wiki --> Index[index.json]
  Wiki --> Graph[Knowledge Graph]
```

Capacidades:

- exportacion de grafo en JSON
- visualizacion basica
- deteccion de nodos huerfanos
- deteccion de relaciones rotas
- navegacion por vecindad de documentos
- compatibilidad futura con Obsidian u otras herramientas de grafo

## Fase 4: RAG

Objetivo: permitir recuperacion semantica de conocimiento para respuestas mas precisas del LLM.

Capacidades:

- chunking de documentos Markdown
- embeddings opcionales
- vector store opcional
- recuperacion semantica
- reranking
- contexto progresivo para conversaciones LLM
- mezcla de busqueda textual, metadatos, grafo y similitud semantica

Flujo esperado:

```mermaid
flowchart TD
  Query[Consulta del usuario] --> Text[Busqueda textual]
  Query --> Vector[Busqueda semantica]
  Query --> Graph[Grafo de relaciones]
  Text --> Rank[Reranking]
  Vector --> Rank
  Graph --> Rank
  Rank --> Context[Contexto seleccionado]
  Context --> LLM[Respuesta del LLM]
```

## Fase 5: Backends Opcionales

Objetivo: permitir almacenamiento avanzado sin abandonar la portabilidad inicial.

La wiki basada en archivos debe seguir siendo una opcion valida.

Backends posibles:

- SQLite para busqueda e indices locales
- bases vectoriales para RAG
- almacenamiento remoto para sincronizacion
- backend cloud opcional
- exportacion/importacion entre backends

Principio clave:

Los backends avanzados deben ser opcionales. No deben ser necesarios para usar T.H.O.T.H. en su forma basica.

## Fase 6: Ecosistema de Agentes y Skills

Objetivo: convertir T.H.O.T.H. en una plataforma extensible.

Capacidades:

- registro de agentes
- registro de skills
- contratos de entrada/salida
- instalacion de paquetes de skills
- perfiles por dominio
- agentes especializados para escritura, investigacion, lore, codigo o documentacion

## Prioridad Inicial

La prioridad tecnica inmediata es construir una base simple y fiable:

1. estructura del proyecto
2. workspace local
3. lectura y escritura de Markdown con frontmatter
4. indice local derivado
5. CLI minima
6. MCP minimo
7. Memory Protocol basico
8. skill pack LLM Wiki para config, ingest, query, lint, integrate y crystallize

Solo despues deberian entrar grafo, RAG y backends opcionales.
# Migración segura restante

La fase 1 migra `status` y `doctor` al Core. Ambos intents son read-only,
tienen esquemas estrictos y propagan la superficie (`cli`/`mcp`) a la auditoría.
El doctor no reconstruye índices ni realiza reparaciones.

## Fase 2: `relate` en Core

`relate` se migra mediante `plan`/`execute`, con allowlist, propuesta,
confirmación y token, y auditoría con superficie `cli`/`mcp`. El alcance es
deliberadamente acotado: un único documento fuente por ejecución; se conserva
el lock y la escritura atómica existentes, y se actualiza únicamente ese
Markdown. No se regeneran índices ni se sincronizan enlaces derivados.

## Fase 3: relaciones y enlaces multiarchivo

El contrato Core/storage incorpora `sync_links` y migra `sync-links` mediante
`plan`/`execute`, token, `dryRun` y auditoría CLI/MCP. Todos los cambios se
preparan antes de escribir y se aplican bajo lock con `atomicWriteBatch`; un
fallo intermedio revierte el lote completo. Las operaciones son idempotentes.

`relate` conserva compatibilidad por defecto. La sincronización derivada solo
se incluye con `syncLinks: true` explícito en el input/plan. `index` e `init` no
se migran en esta fase.

## Fase 4: `index` atómico en Core

`index` se ejecuta mediante `plan`/`execute`, token, `dryRun` y auditoría CLI/MCP.
Construye los índices técnicos y la vista humana en memoria, valida ambos antes
del commit y publica todos los archivos con lock y `atomicWriteBatch`. Las
páginas humanas y de categoría generadas que quedan obsoletas se eliminan en
el mismo batch y se restauran en un rollback. Las opciones humanas no se
ignoran: `curated`, `categoryPages`, `type` y `maxPerSection` requieren
`human: true`.

## Fase 6 final: `init` en Core

`init` se ejecuta mediante `plan`/`execute` y auditoría con superficie `cli` o
`mcp`. `dryRun` es read-only; la creación requiere siempre `confirmed: true` y
el token exacto de la propuesta. La inicialización usa lock, es idempotente,
preserva archivos existentes y revierte archivos, directorios y lock creados
si una operación falla parcialmente.
