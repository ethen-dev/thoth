# Architecture

La arquitectura de T.H.O.T.H. se organiza alrededor de un agente maestro encargado de coordinar la entrada, procesamiento, almacenamiento y consulta de conocimiento.

El sistema debe ser modular para permitir que agentes, skills, interfaces y mecanismos de almacenamiento evolucionen de forma independiente.

## Componentes Principales

### T.H.O.T.H. Core

El nucleo del sistema. Coordina el flujo de trabajo general y decide como debe procesarse cada entrada de informacion.

Responsabilidades iniciales:

- recibir informacion del usuario o de una interfaz
- analizar tipo, intencion y contexto del contenido
- decidir si procesa directamente o delega
- seleccionar agentes o skills necesarias
- coordinar escritura, actualizacion y consulta de la LLM Wiki
- mantener consistencia entre documentos relacionados

### Agentes

Los agentes son unidades especializadas de razonamiento o ejecucion.

Pueden encargarse de tareas como resumir, redactar, clasificar, revisar coherencia, extraer entidades, construir cronologias o detectar relaciones entre documentos.

Cada agente debe tener una funcion clara y un contrato de entrada/salida definido.

### Skills

Las skills son capacidades reutilizables que pueden ser invocadas por T.H.O.T.H. o por agentes especializados.

Una skill debe resolver una tarea concreta, por ejemplo normalizar notas, generar una ficha de personaje, extraer decisiones de una conversacion o convertir texto libre en una pagina wiki.

### LLM Wiki

La LLM Wiki es la memoria persistente del sistema.

Debe almacenar informacion en documentos legibles, estructurados y faciles de consultar tanto por humanos como por modelos de lenguaje.

La wiki debe priorizar claridad, trazabilidad y relaciones entre piezas de conocimiento.

### Storage

El almacenamiento define donde y como se guarda la informacion.

Inicialmente puede basarse en archivos locales, pero la arquitectura debe permitir evolucionar hacia otros mecanismos como bases de datos, indices vectoriales o almacenamiento remoto.

### Index

El indice permite localizar y relacionar informacion dentro de la LLM Wiki.

Puede incluir metadatos, etiquetas, relaciones, resumenes, referencias cruzadas y, en fases futuras, embeddings o busqueda semantica.

### CLI

La CLI sera la primera interfaz practica del sistema.

Debe permitir acciones como inicializar un workspace, registrar informacion, consultar conocimiento, listar documentos, ejecutar skills y revisar el estado de la wiki.

## Flujo General

1. El usuario introduce informacion mediante una interfaz, inicialmente la CLI.
2. T.H.O.T.H. Core recibe la entrada y analiza su proposito.
3. El Core decide si necesita agentes o skills especializadas.
4. Los agentes o skills procesan la informacion y devuelven resultados estructurados.
5. El Core valida, organiza y escribe el resultado en la LLM Wiki.
6. El indice se actualiza con metadatos y relaciones relevantes.
7. El usuario puede consultar, ampliar o reutilizar el conocimiento almacenado.

## Principios Arquitectonicos

- **Core pequeno:** el nucleo debe coordinar, no absorber todas las responsabilidades.
- **Especializacion:** cada agente o skill debe tener una funcion concreta.
- **Archivos legibles:** la memoria debe ser util incluso sin ejecutar el sistema.
- **Contratos claros:** entradas y salidas deben ser predecibles.
- **Evolucion incremental:** cada componente debe poder empezar simple y crecer con el proyecto.
- **Interoperabilidad:** los datos deben poder ser reutilizados por humanos, LLMs y herramientas externas.

## Direccion Inicial

La primera version deberia enfocarse en un flujo minimo:

1. inicializar un workspace T.H.O.T.H.
2. recibir una nota o bloque de informacion
3. transformarlo en una pagina de LLM Wiki
4. guardarlo en una estructura local
5. permitir una consulta basica desde CLI
