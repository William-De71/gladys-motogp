# MotoGP

## Presentación

Esta integración trae el **Campeonato del Mundo de MotoGP** a Gladys: las sesiones de **MotoGP, Moto2, Moto3** y de la **Bagger World Cup**, los resultados y la clasificación del campeonato. Cada categoría seguida se convierte en un **calendario** para cada usuario que activa la integración. Las escenas pueden reaccionar antes de la salida de una sesión, cuando se publican los resultados o cuando cambia el líder del campeonato, y cuatro widgets muestran la próxima sesión, el horario, la clasificación y los últimos resultados.

Los datos proceden de [motogp.com](https://www.motogp.com), la web oficial del campeonato, que los publica sin cuenta ni clave. Esta integración no es oficial: no tiene relación con Dorna Sports, la FIM ni motogp.com.

## Requisitos

- Gladys Assistant **5.3.0** o posterior (integraciones de tipo calendario).
- Acceso a internet. Ninguna cuenta, ninguna clave.

## Configuración

| Campo                               | Descripción                                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Categorías                          | MotoGP (por defecto), Moto2, Moto3, Bagger World Cup. Un calendario cada una. La Bagger World Cup no tiene resultados ni clasificación. |
| Sesiones                            | Carreras, sprints, clasificación (por defecto), entrenamientos, warm up, tests fuera de los Grandes Premios.                            |
| Pilotos favoritos (opcional)        | Dorsales o nombres separados por comas («93, Bezzecchi»). Destacados en los widgets y pasados a las escenas.                            |
| Idioma de los textos de las escenas | El idioma de las frases de los disparadores y acciones de escena. Automático: el idioma del panel.                                      |

Guarde y luego, en **Mis calendarios** en la misma página, pulse **Activar para mí**. Cada usuario que quiera los calendarios activa la integración para sí mismo.

Un dorsal designa al piloto que lo lleva en cada categoría seguida; un nombre (o parte de él, sin tener en cuenta los acentos) es más preciso.

## Uso

### Calendarios

Cada categoría seguida es un calendario («MotoGP», «Moto2»…), con:

- un evento por sesión de los tipos elegidos, a la hora de Gladys: «MotoGP · Sprint – Portugal». Las carreras no tienen hora de fin en el calendario oficial: su fin se estima (45 minutos, 25 para el sprint);
- el circuito, la ciudad y el país como lugar, el nombre oficial del Gran Premio y su ronda como descripción;
- las sesiones desde hace 14 días hasta el final de la temporada, y la temporada siguiente en cuanto motogp.com la publica (a partir de septiembre). Una sesión movida sigue, una sesión retirada desaparece.

Un calendario nuevo es **privado**. En **Mis calendarios**, active **Compartir con el hogar** para usarlo en las escenas del hogar (y con el disparador nativo «Se acerca un evento del calendario»), o desactive **Sincronizar este calendario** para ignorarlo. Una categoría retirada de la configuración borra su calendario.

### Widgets del panel

![Los cuatro widgets: la próxima sesión antes del Gran Premio de Portugal, el horario, la clasificación de MotoGP y los resultados de la carrera de Catar, con Pedro Acosta como favorito (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-motogp/main/docs/assets/widgets.es.png)

- **Próxima sesión MotoGP**: la cuenta atrás, el día y la hora, y luego las sesiones restantes del fin de semana (punto rojo: carrera, naranja: sprint, azul: clasificación).
- **Horario de MotoGP**: las próximas 3, 5 u 8 sesiones con día, hora y circuito.
- **Clasificación MotoGP**: el líder, su ventaja sobre el segundo y luego el top 5 o 10; sus pilotos favoritos van en verde y se añaden debajo si no están en el top.
- **Resultados MotoGP**: la última carrera, el último sprint o la última clasificación de una categoría, con las diferencias; sus favoritos en verde.

Los dos primeros pueden limitarse a ciertas categorías o sesiones en sus ajustes; los otros dos muestran una categoría a elegir.

### Escenas

Disparadores:

- **MotoGP: empieza una sesión**: en la salida, o 15, 30, 60 o 120 minutos antes (a elegir en «Cuándo»). Filtros: categorías, sesiones.
- **MotoGP: resultados publicados**: se publica la clasificación de una carrera, un sprint o la clasificación (la parrilla), normalmente unos minutos después de la llegada. Filtros: categorías, sesiones y **resultado de mi piloto favorito** (gana, segundo o tercero, 4.º a 10.º, 11.º o más atrás, no clasificado, ausente).
- **MotoGP: nuevo líder del campeonato**: otro piloto lidera el campeonato de una categoría.

Variables principales: `title` («MotoGP · Carrera – Qatar»), `category`, `session` (race, sprint, qualifying…), `session_name`, `grand_prix`, `round`, `circuit`, `date`, `time`; para los resultados `winner_name`, `winner_team`, `second_name`, `third_name`, `podium`, `favorite_name`, `favorite_position` (-1 si no está clasificado), `favorite_points`, `favorite_result` y una frase lista `text`; para el líder `leader_name`, `leader_points`, `gap_to_second`, `previous_leader_name`.

Acciones:

- **MotoGP: próxima sesión**: título, categoría, sesión, Gran Premio, circuito, fecha, hora, minutos hasta la salida y una frase `text`.
- **MotoGP: clasificación del campeonato**: los tres primeros y sus diferencias, la posición, los puntos y la desventaja de su piloto favorito, y una frase `text`.
- **MotoGP: últimos resultados**: el ganador, el podio, el resultado de su favorito y una frase `text`.

Ejemplos:

- Cuando **la carrera de MotoGP empiece en 15 minutos** → encender la tele y atenuar el salón.
- Cuando **se publiquen los resultados de la carrera** y **gane mi favorito** → poner las luces en verde y enviar `{{triggerEvent.data.text}}`.
- Cada lunes a las 8:00 → **MotoGP: clasificación del campeonato** y enviar su `text` por Telegram.

Los resultados y el cambio de líder no disparan nada en la primera lectura (una instalación el domingo por la noche no anuncia la carrera de la tarde).

### Transporte

Solo nube. La integración lee el calendario, las clasificaciones y el campeonato públicos de motogp.com por internet: unas decenas de peticiones al día, una cada 30 minutos aproximadamente durante un fin de semana de carreras. Nada sobre usted ni su casa sale de su red.

## Solución de problemas

- **Los calendarios siguen vacíos**: compruebe que pulsó **Activar para mí** en Mis calendarios y que el estado de la integración no indica que motogp.com no responde.
- **«No se puede acceder a motogp.com»**: la integración vuelve a intentarlo sola 15 minutos después; lo ya leído sigue visible.
- **No hay resultados**: motogp.com publica la clasificación unos minutos después de la llegada; la integración la pide cada 5 minutos durante 3 horas y luego cada hora. La Bagger World Cup no tiene resultados en motogp.com.
- **Mi favorito no se reconoce**: escriba su apellido como lo escribe motogp.com («Marquez», «Viñales» o «Vinales») o su dorsal.
- **Los horarios cambian**: durante un fin de semana de carreras, el calendario se vuelve a leer cada 30 minutos; las sesiones movidas siguen en los calendarios y los avisos.

Para informar de un error, indique las versiones de Gladys y de la integración, las categorías seguidas y las líneas de la pestaña Registros de la integración; en modo desarrollador, `DEBUG=gladys-integration-sdk` añade los registros del SDK.
