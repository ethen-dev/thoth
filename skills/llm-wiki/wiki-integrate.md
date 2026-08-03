---
id: wiki-integrate
name: wiki-integrate
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: indexer
---

# wiki-integrate

Integra paginas nuevas o modificadas dentro de la red de conocimiento.

## Cuando Usarla

- despues de crear una pagina
- despues de actualizar una decision, entidad o proyecto
- cuando faltan relaciones o backlinks
- antes de generar grafo o indices derivados

## Entradas

- documento nuevo o actualizado
- documentos relacionados
- relaciones propuestas
- indice actual

## Salidas

- relaciones confirmadas
- backlinks sugeridos
- indice actualizado o instrucciones de rebuild
- advertencias de integracion

## Reglas

- No inventar relaciones fuertes sin evidencia.
- Marcar relaciones inciertas como propuestas.
- Pedir confirmacion para `supersedes`, `contradicts` o cambios canonicos.
- Mantener indices derivados regenerables.

## Handoff

- `indexer` integra estructura.
- `critic` revisa relaciones sensibles.
- `librarian` puede recuperar vecindad contextual.
