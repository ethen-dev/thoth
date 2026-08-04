---
id: wiki-query
name: wiki-query
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: librarian
---

# wiki-query

Busca texto en la LLM Wiki de forma determinista y read-only. No ejecuta el
cuerpo de esta skill ni ningún comando, URL o proveedor externo.

## Input

La invocación requiere un objeto con:

- `query`: string no vacío, máximo 500 caracteres.
- `type`: string opcional.
- `status`: string opcional.
- `tag`: string opcional.

No se aceptan otros campos.

## Modos

- `validate`: valida metadata e input sin consultar la wiki.
- `execute`: ejecuta la búsqueda read-only.

## Output

`execute` devuelve `{ results }`. Cada resultado contiene únicamente:

```json
{
  "id": "document-id",
  "title": "Document title",
  "type": "note",
  "status": "active",
  "tags": ["tag"],
  "path": "notes/document.md",
  "snippet": "Texto normalizado, máximo 500 caracteres."
}
```

No devuelve `content`, `raw`, `metadata`, relaciones, proyectos, topic keys,
límites de resultados ni modos `summary`, `full` o `metadata`.
