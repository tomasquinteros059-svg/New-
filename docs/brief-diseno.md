# Relevo — brief de diseño

Este documento es el encargo. Existe para que cualquiera que vaya a tocar el
diseño —una persona, una skill de crítica, un diseñador nuevo— entienda qué es
esta app, quién la usa, dónde, y qué significa acá que el diseño esté "mejor".

No es documentación de lo que hay. Es el criterio contra el cual juzgar lo que
hay.

---

## 1. Qué es Relevo, en una frase

Una cola de trabajo con capacidad: las tareas de un turno están a la vista, cada
persona toma las que puede sostener, y nadie puede tomar más de lo que aguanta.

## 2. El problema que resuelve

En un taller, un galpón o una cuadrilla, el trabajo del turno se reparte por
mensajes sueltos, gritos y memoria. Tres cosas fallan siempre:

1. **Dos personas empiezan la misma tarea.** Nadie se entera hasta que están las
   dos ahí paradas.
2. **Una persona junta ocho tareas** porque es la que contesta, y no termina
   ninguna.
3. **Una tarea se olvida.** Alguien la tomó, se fue a otra cosa, y nadie sabe
   que sigue abierta hasta que el cliente reclama.

Relevo ataca esas tres. Exclusividad garantizada por la base de datos, tope de
tareas activas por persona, y rescate automático de lo que quedó quieto.

## 3. Quién la usa

**Trabajador** — el que está en el piso.
- Tiene las manos sucias, guantes puestos la mitad del tiempo.
- Mira el teléfono de pie, en dos o tres segundos, entre una cosa y otra.
- Le importan dos preguntas y nada más: *¿qué tengo que hacer ahora?* y *¿qué
  hay libre que pueda agarrar?*
- No va a leer. Va a mirar.

**Supervisor** — el que reparte y responde.
- Hace todo lo del trabajador, más: crear tareas, asignarlas, ver la carga del
  equipo, destrabar lo que se trancó.
- Mira la app sentado a veces, de pie otras.
- Su pregunta es: *¿quién está saturado y qué quedó tirado?*

Una misma persona puede ser las dos cosas.

## 4. Dónde se usa — esto manda sobre todo lo demás

- **Un teléfono.** No una tablet, no un escritorio. Pantalla chica, una mano.
- **Luz de galpón o de calle.** Sol directo o tubo fluorescente, rara vez la luz
  agradable de una oficina.
- **Con guantes o con las manos mojadas.** Los objetivos de toque tienen que ser
  generosos de verdad, no 44 píxeles justos porque lo dice una guía.
- **Señal mala.** La app tiene que sentirse rápida aunque la red no lo sea.
- **De pie, apurado, interrumpido.** Nadie va a "explorar" la app. Entra,
  resuelve una cosa, sale.

De acá sale la regla que ordena todo: **una cosa por pantalla.**

## 5. Las pantallas que existen hoy

| Pantalla | Para qué | Quién |
|---|---|---|
| Mis tareas | Lo que tengo activo ahora, y cuánta capacidad me queda | Los dos |
| Disponibles | La cola de lo que nadie tomó | Los dos |
| Detalle de tarea | Tomar, cerrar, soltar, ver qué pide | Los dos |
| Nueva tarea | Crear | Supervisor |
| Editar / Asignar | Corregir, o dársela a alguien | Supervisor |
| Equipo | Padrón y carga de cada uno | Supervisor |
| Detalle de persona | Su carga, su tope, su rol | Supervisor |
| Control | Lo estancado, lo vencido, lo que hay que destrabar | Supervisor |
| Habilidades | Qué sabe hacer cada uno | Supervisor |
| Ajustes | Topes, horas de rescate | Supervisor |
| Cuenta | Nombre, presencia, salir | Los dos |

## 6. Las reglas del negocio que el diseño tiene que dejar ver

El diseño no puede contradecir esto, y donde pueda, tiene que hacerlo obvio
antes de que la persona toque nada:

- **Una tarea es de una sola persona.** Si alguien la tomó, se acabó.
- **Hay un tope de tareas activas.** Cuando estás en el tope, no podés tomar más
  — y eso se tiene que ver *antes* de intentar, no después del error.
- **Soltar una tarea exige un motivo de una línea.** Obligatorio.
- **Cerrar exige una nota.** Y si la tarea lo pide, evidencia.
- **Sin la habilidad, no se puede tomar.** Y tiene que decir cuál falta.
- **Orden de la cola:** prioridad, después vencimiento, después antigüedad.

## 7. El sistema visual que ya existe

No se parte de cero. Hay un sistema con criterio, en `src/app/globals.css`:

**Superficies** — fondo papel cálido `#f4f1ea` en vez de blanco puro, porque
blanco puro bajo un tubo fluorescente encandila. Tarjetas en blanco sobre ese
papel.

**Tinta** — `#14171b`, casi negro, contraste alto a propósito.

**Marca** — azul petróleo (`--color-brand-*`). Industrial, sobrio, no
tecnológico.

**Señal** — naranja `#cf5320`. **Un solo color de acción, y es una regla dura:
si es naranja, se toca.** Nunca de adorno.

**Estado** — verde libre / marrón ocupado para las personas; rojo, ámbar y gris
azulado para prioridad alta, media y baja.

**Tipografía** — Archivo para títulos (grotesca industrial, con carácter) y
Public Sans para texto. Ambas viajan adentro del APK.

**Modo oscuro** — paleta propia redefinida, no invertida.

## 8. Qué significa acá "mejorar la imagen"

Lo que se busca **sí**:

- Que a los dos segundos de abrirla se entienda qué hay que hacer, sin leer.
- Que la jerarquía de acciones sea inequívoca: una acción principal por
  pantalla, el resto claramente secundario.
- Que se vea como una herramienta de trabajo seria, no como una app de notas.
  Alguien tiene que poder mostrársela a un cliente sin vergüenza.
- Que los estados de la tarea se lean de un vistazo, desde lejos, a contraluz.
- Que el vacío no sea un hueco: "no tenés nada" también comunica.
- Que cada pantalla tenga peso visual propio y no todas parezcan la misma lista
  gris.

Lo que **no** se busca:

- Adornos. Degradados, sombras suaves, ilustraciones simpáticas: no.
- Animación por gusto. Solo si aclara de dónde vino algo o a dónde fue.
- Densidad. No entra más información: entra *mejor jerarquizada* la que hay.
- Personalidad de startup. Esto es para un galpón.
- Romper el sistema. Los tokens existentes son el punto de partida; si hay que
  cambiar uno, se cambia con un motivo escrito.

## 9. Restricciones técnicas, no negociables

- **Tailwind v4 con tokens en `@theme`.** Nada de `tailwind.config.js`, nada de
  valores sueltos en las clases: si un color no es un token, no va.
- **Los colores se consumen con `var()`**, que es lo que hace que el modo oscuro
  funcione en caliente.
- **Todo tiene que andar en modo claro y oscuro.** Las dos paletas, siempre.
- Los componentes viven en `src/components/` y los comparten la app real y el
  demo. Cambiar un componente cambia las dos.
- El APK lleva la interfaz adentro: **tiene que verse bien sin red.**

## 10. Cómo se sabe si salió bien

1. Alguien que nunca vio la app encuentra "qué hago ahora" en menos de dos
   segundos.
2. En cada pantalla, señalar la acción principal no admite discusión.
3. Ningún objetivo de toque baja de 44 px, y los principales son más grandes.
4. Contraste AA en todo el texto, en las dos paletas.
5. Se puede operar con una sola mano, con el pulgar.
6. Un supervisor detecta al saturado del equipo sin leer un número.
