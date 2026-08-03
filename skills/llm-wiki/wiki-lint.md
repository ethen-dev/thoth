---
id: wiki-lint
name: wiki-lint
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: indexer
---

# wiki-lint

Revisa la salud estructural y semantica basica de la LLM Wiki.

## Cuando Usarla

- despues de cambios importantes
- antes de rebuild de indices
- cuando hay documentos rotos
- periodicamente como mantenimiento

## Entradas

- ruta de wiki
- documentos Markdown
- schemas disponibles
- indices derivados existentes

## Salidas

- errores
- warnings
- documentos huerfanos
- relaciones rotas
- metadatos invalidos
- recomendaciones de reparacion

## Reglas

- Distinguir errores bloqueantes de warnings.
- No modificar contenido en modo lint.
- Sugerir reparacion concreta cuando sea posible.

## Handoff

- `indexer` produce reporte.
- `critic` evalua problemas semanticos.
- `scribe` puede reparar legibilidad o estructura.
