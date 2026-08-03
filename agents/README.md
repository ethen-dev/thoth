# T.H.O.T.H. Agents

Esta carpeta contiene las definiciones operativas de los agentes propios de T.H.O.T.H.

Cada agente se define como Markdown con frontmatter YAML para que pueda ser leido por humanos y procesado por herramientas del sistema.

## Categories

- `core`: coordinacion y decision global
- `knowledge`: memoria, clasificacion, recuperacion, relaciones e indices
- `writing`: redaccion y normalizacion
- `review`: coherencia, contradicciones, duplicados y riesgos

## Initial Agents

- `core/thoth-core.md`
- `knowledge/archivist.md`
- `knowledge/indexer.md`
- `knowledge/librarian.md`
- `writing/scribe.md`
- `review/critic.md`

## Discovery

En fases futuras, T.H.O.T.H. podra descubrir agentes recorriendo esta carpeta y leyendo su frontmatter.

El campo `category` ayudara a decidir que agentes estan disponibles para cada tipo de tarea.
