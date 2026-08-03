---
id: wiki-crystallize
name: wiki-crystallize
category: llm-wiki
status: draft
version: 0.1.0
primary_agent: archivist
---

# wiki-crystallize

Convierte una sesion conversacional en memoria duradera.

## Cuando Usarla

- al cerrar una sesion importante
- despues de una conversacion larga
- cuando se tomaron decisiones relevantes
- cuando aparecieron ideas, dudas o siguientes pasos
- antes de compactar o reiniciar contexto

## Entradas

- resumen de conversacion
- decisiones tomadas
- documentos modificados
- preguntas abiertas
- proyecto activo
- contexto recuperado de la wiki

## Salidas

- resumen de sesion
- actualizaciones propuestas a documentos existentes
- nuevas notas o decisiones
- siguientes pasos
- relaciones nuevas

## Reglas

- Preferir actualizar documentos canonicos antes que crear notas sueltas.
- Separar decisiones, hallazgos, dudas y tareas futuras.
- No guardar ruido conversacional.
- Preservar contexto que ayude a continuar en la siguiente sesion.
- Pedir confirmacion si se altera conocimiento canonico.

## Handoff

- `archivist` identifica memoria duradera.
- `scribe` redacta la pagina o resumen.
- `critic` revisa decisiones sensibles.
- `indexer` integra cambios.
