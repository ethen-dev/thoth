# Repository Structure

Este documento define la estructura inicial del repositorio T.H.O.T.H.

La organizacion debe separar claramente la logica central, las interfaces, los agentes, las skills, los esquemas y los ejemplos para que el proyecto pueda crecer de forma modular.

## Estructura Propuesta

```text
thoth/
  docs/
  src/
    core/
    cli/
    mcp/
    wiki/
    agents/
    skills/
    storage/
  schemas/
  examples/
  tests/
```

## Directorios

### docs/

Documentacion conceptual y tecnica del proyecto.

Incluye vision, arquitectura, modelo de datos, CLI, MCP y futuras decisiones de diseno.

### src/

Codigo fuente principal del proyecto.

Debe contener la implementacion real de T.H.O.T.H. y sus interfaces.

### src/core/

Logica central compartida por todas las interfaces.

Responsabilidades:

- coordinar acciones internas
- validar entradas
- decidir flujos basicos
- conectar wiki, storage, agents y skills
- exponer operaciones reutilizables para CLI y MCP

El core no debe depender directamente de una interfaz concreta.

### src/cli/

Implementacion de la CLI.

Responsabilidades:

- definir comandos de terminal
- parsear argumentos
- presentar salida legible
- invocar acciones del core
- administrar workspace local

### src/mcp/

Implementacion de la capa MCP.

Responsabilidades:

- exponer herramientas MCP
- traducir llamadas del LLM a acciones del core
- devolver respuestas estructuradas
- controlar operaciones de lectura y escritura

### src/wiki/

Logica especifica de la LLM Wiki.

Responsabilidades:

- crear paginas Markdown
- leer frontmatter YAML
- validar estructura de documentos
- generar rutas
- actualizar indices
- gestionar relaciones basicas entre documentos

### src/agents/

Definiciones e implementaciones de agentes especializados.

Responsabilidades:

- declarar agentes disponibles
- definir su proposito
- establecer contratos de entrada y salida
- permitir invocacion desde T.H.O.T.H. Core

### src/skills/

Capacidades reutilizables invocables por el core, agentes o MCP.

Responsabilidades:

- declarar skills disponibles
- implementar transformaciones concretas
- mantener contratos claros de entrada y salida
- facilitar extension modular del sistema

### src/storage/

Capa de acceso a almacenamiento.

Responsabilidades:

- leer y escribir archivos
- abstraer rutas del workspace
- evitar sobrescrituras accidentales
- permitir evolucion futura hacia otros backends

La primera version puede ser almacenamiento local en disco.

### schemas/

Contratos estructurados del sistema.

Puede incluir JSON Schema u otros formatos para validar:

- documentos wiki
- configuracion
- tools MCP
- agentes
- skills
- respuestas internas

### examples/

Ejemplos de uso y datos de referencia.

Puede incluir:

- workspaces de ejemplo
- paginas wiki de muestra
- entradas de prueba
- ejemplos de CLI
- ejemplos de herramientas MCP

### tests/

Pruebas automatizadas del proyecto.

Debe cubrir progresivamente:

- core
- CLI
- MCP
- wiki
- storage
- schemas

## Principios de Organizacion

- **Core independiente:** la logica central no debe conocer detalles de CLI o MCP.
- **Interfaces delgadas:** CLI y MCP deben traducir entradas y salidas, no contener logica de negocio pesada.
- **Wiki legible:** los documentos generados deben seguir siendo utiles sin ejecutar T.H.O.T.H.
- **Modularidad:** agentes y skills deben poder agregarse sin modificar grandes partes del sistema.
- **Schemas primero cuando aporte claridad:** los contratos importantes deben estar documentados y validados.
- **Evolucion incremental:** crear carpetas cuando sean necesarias, evitando estructura vacia excesiva.

## Direccion Inicial

La primera implementacion deberia crear solo las carpetas necesarias para el flujo minimo:

```text
src/
  core/
  cli/
  wiki/
  storage/
schemas/
examples/
tests/
```

MCP, agents y skills pueden incorporarse cuando el nucleo local de lectura, escritura e indexado sea estable.
