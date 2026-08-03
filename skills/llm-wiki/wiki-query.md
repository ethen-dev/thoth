---
id: wiki-query
name: wiki-query
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: librarian
---

# wiki-query

Consulta la LLM Wiki usando recuperacion progresiva.

## Cuando Usarla

- el usuario pregunta por conocimiento previo
- hace falta recuperar contexto antes de actuar
- se debe evitar duplicar informacion
- una sesion nueva necesita bootstrap
- despues de compactacion o perdida de contexto

## Entradas

- query
- proyecto o dominio activo
- filtros opcionales: tipo, tags, status, topic key
- limite de resultados
- modo: `summary`, `full`, `metadata`

## Salidas

- documentos candidatos
- resumenes
- IDs y rutas
- relaciones relevantes
- recomendacion de siguiente lectura

## Reglas

- No cargar documentos completos por defecto.
- Priorizar documentos activos y del proyecto actual.
- Devolver referencias trazables.
- Advertir si el resultado es ambiguo o insuficiente.

## Handoff

- `librarian` ejecuta la consulta.
- `thoth-core` decide si usar el resultado para responder o delegar.
- `critic` revisa si hay contradicciones.
