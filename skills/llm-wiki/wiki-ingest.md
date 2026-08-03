---
id: wiki-ingest
name: wiki-ingest
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: archivist
---

# wiki-ingest

Procesa informacion nueva y la convierte en una o mas paginas de la LLM Wiki.

## Cuando Usarla

- el usuario pide guardar informacion
- hay una fuente nueva que debe incorporarse
- una conversacion contiene conocimiento duradero
- una nota debe clasificarse y estructurarse

## Entradas

- contenido fuente
- origen: `conversation`, `file`, `manual`, `import`
- proyecto o dominio activo
- documentos candidatos recuperados por `librarian`
- data model vigente

## Salidas

- pagina nueva propuesta
- actualizacion propuesta
- metadatos
- relaciones
- preguntas abiertas
- confidence score

## Reglas

- Buscar antes de crear.
- Actualizar antes de fragmentar cuando exista tema canonico.
- Usar `draft` si no hay confirmacion canonica.
- Crear relaciones iniciales cuando sean claras.
- Pedir confirmacion si hay conflicto, reemplazo o ambiguedad fuerte.

## Handoff

- `archivist` clasifica y estructura.
- `scribe` redacta contenido final.
- `critic` revisa conflictos.
- `indexer` integra despues de escribir.
