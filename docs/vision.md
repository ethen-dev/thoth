# Vision

T.H.O.T.H. es el agente maestro de un sistema orientado a convertir informacion dispersa en conocimiento estructurado, persistente y consultable.

El proyecto busca construir una base reusable para que cualquier persona pueda organizar proyectos, ideas, documentacion, lore, capitulos, investigaciones o cualquier otro material de trabajo en formato **LLM Wiki**.

## Proposito

T.H.O.T.H. debe actuar como un archivista inteligente: recibe informacion, entiende su contexto, decide como clasificarla, delega tareas a agentes o skills especializadas y mantiene una memoria ordenada que pueda consultarse y evolucionar con el tiempo.

Su valor no esta solo en almacenar datos, sino en transformar material desordenado en conocimiento util, conectado y reutilizable.

## Repositorio

Este repositorio contiene la base del ecosistema T.H.O.T.H.:

- agentes
- skills
- estructuras de datos
- documentacion
- herramientas
- CLI
- ejemplos
- mecanismos de almacenamiento y consulta

La intencion es que el proyecto pueda instalarse, configurarse y usarse de forma modular por diferentes personas y casos de uso.

## Flujo Conceptual

1. El usuario aporta informacion.
2. T.H.O.T.H. analiza el contenido y detecta su tipo, contexto y relevancia.
3. T.H.O.T.H. decide si debe procesarlo directamente o delegarlo a un agente o skill especializada.
4. El sistema redacta, normaliza y relaciona la informacion.
5. El conocimiento se almacena en una LLM Wiki consultable.
6. El usuario puede recuperar, ampliar o reutilizar ese conocimiento en el futuro.

## Principios

- **Persistencia:** el conocimiento importante no debe perderse entre conversaciones o sesiones.
- **Claridad:** la informacion almacenada debe ser facil de entender y reutilizar.
- **Modularidad:** agentes, skills y herramientas deben poder evolucionar de forma independiente.
- **Trazabilidad:** las decisiones, fuentes y transformaciones relevantes deben poder revisarse.
- **Extensibilidad:** el sistema debe admitir nuevos dominios, formatos y flujos de trabajo.
- **Usabilidad:** T.H.O.T.H. debe poder usarse desde interfaces practicas, empezando por una CLI.

## Direccion Inicial

El desarrollo inicial se centrara en definir la arquitectura del sistema, el modelo de datos de la LLM Wiki, la estructura de agentes y skills, y un primer flujo usable desde CLI.
