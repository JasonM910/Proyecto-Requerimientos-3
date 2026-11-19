# Revisión de diseño y datos compartidos

Revisión del 19 de noviembre de 2026. La paleta está inspirada en el
[sitio de la Municipalidad de San Carlos](https://www.munisc.go.cr/):
azul `#13416E`, azul oscuro `#0F2143` y celeste `#00ACC8`.
Es una adaptación de los colores del sitio, sin incorporar el logo ni afirmar
que constituye un manual oficial de marca.

La interfaz usa CSS propio, sin Tailwind. Los colores se concentran en variables
en `src/index.css`; los componentes consumen esos valores en `src/App.css`.
Los botones e iconos SVG tienen dimensiones y alineación consistentes, foco
visible y estados deshabilitados. Se conservaron los colores semánticos de
errores y advertencias y se retiraron mensajes sobre JSON, demostraciones y
datos ficticios de las pantallas. Las fotografías muestran la imagen sin
nombre de archivo ni tamaño.

Se revisaron 16 pantallas y estados ciudadanos y municipales, incluidos acceso,
registro, creación y consulta de reportes, captura, notificaciones, filtros,
edición de categoría y estado y listas vacías. Se comprobaron desbordamientos a
320, 390, 768, 1024 y 1366 px, sin hallazgos. Se ejecutaron 32 análisis de
axe-core (390 y 1366 px), reglas WCAG 2 A/AA y 2.1 AA, sin infracciones detectadas.
También se verificaron iconos, textos y errores de JavaScript y se revisaron
capturas de móvil y escritorio. Audio y cámara se probaron con dispositivos
simulados; no se hicieron solicitudes con una clave real de Google Maps.
Estos controles no equivalen a una certificación de accesibilidad ni sustituyen
las pruebas de GPS y captura en dispositivos físicos.

Las tres cuentas compartidas y los doce casos iniciales se definen en
`server/demoData.js`. Las pruebas verifican acceso por autor, persistencia,
reinicios sin duplicados y migración sin alterar cuentas personales.
`data/database.json` contiene la instantánea compartida con los registros e
historiales actuales. `npm run db:export` la actualiza sin sesiones ni
contraseñas personales: asigna las claves públicas de prueba del README.
`data/database.local.json` y `.env.local` permanecen fuera de Git. El primer
inicio importa la instantánea y los siguientes conservan los cambios locales.
