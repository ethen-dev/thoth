# T.H.O.T.H. Skills

Esta carpeta contiene skills conceptuales y operativas que T.H.O.T.H. podra invocar directamente o a traves de sus agentes.

Las skills no son agentes completos. Son capacidades reutilizables con un objetivo concreto, entrada esperada y salida estructurada.

## Skill Packs Iniciales

- `llm-wiki/`: skill pack basado en el patron LLM Wiki inspirado por Andrej Karpathy y por implementaciones comunitarias como `vanillaflava/llm-wiki-skills` y `lewislulu/llm-wiki-skill`.

## Relacion con Agentes

Los agentes deciden cuando usar skills.

Ejemplos:

- `thoth-core` decide que operacion corresponde.
- `archivist` usa skills de ingest o crystallize.
- `librarian` usa skills de query.
- `indexer` usa skills de lint e integrate.
- `scribe` usa skills de redaccion derivadas de ingest o crystallize.
- `critic` revisa outputs de lint, integrate o crystallize.

## Formato

Cada skill debe documentar:

- objetivo
- cuando usarla
- entradas
- salidas
- agente principal recomendado
- agentes secundarios
- reglas de seguridad
- relacion con la LLM Wiki
