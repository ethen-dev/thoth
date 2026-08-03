---
id: wiki-config
name: wiki-config
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: thoth-core
---

# wiki-config

Configura, valida y repara la estructura base de una LLM Wiki.

## Cuando Usarla

- al inicializar un workspace
- cuando cambia `wikiPath`
- cuando falta estructura base
- cuando se detecta configuracion invalida
- antes de ejecutar ingest/query/lint si no hay wiki valida

## Entradas

- ruta de workspace
- `thoth.config.json`
- ruta de wiki resuelta
- modo de operacion: `check`, `init`, `repair`

## Salidas

- estado de configuracion
- ruta efectiva de la wiki
- estructura creada o reparada
- warnings
- errores bloqueantes

## Reglas

- No asumir que la wiki vive dentro del repo.
- Respetar `wikiPath`.
- No sobrescribir documentos existentes sin confirmacion.
- Crear solo estructura minima cuando no exista.
- Mantener archivos humanos y LLM-readable.

## Handoff

- `thoth-core` decide si ejecutar configuracion.
- `indexer` valida indices despues de cambios.
