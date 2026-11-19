# Reporte Ciudadano

Prototipo evolutivo del curso de Requerimientos de Software del Tecnológico de
Costa Rica. Incluye HU-01 a HU-14: reportes con evidencias, gestión municipal,
historial de estados y bandeja de notificaciones ciudadanas. El incremento
HU-14 completa los avisos internos de recepción y su lectura persistente.

El formulario también permite reportar desde el teléfono con una nota de voz
grabada, ubicación GPS o seleccionada en un mapa y fotografías tomadas con la
cámara. La descripción escrita y la dirección manual siguen disponibles.

## Requisitos y ejecución

Necesitás Node.js compatible con Vite 8. No se requieren dependencias
adicionales para el servidor ni para la base JSON. El mapa usa exclusivamente
Google Maps JavaScript API mediante el cargador oficial `@googlemaps/js-api-loader`.

```bash
npm install
npm run dev
```

La aplicación y su API local estarán disponibles en `http://127.0.0.1:5173`.
El repositorio incluye `data/database.json` con cuentas, reportes, evidencias,
historiales y notificaciones compartidos. El primer inicio lo copia a
`data/database.local.json`, donde se guardan los cambios de esa computadora.
La copia local no se incluye en Git y los reinicios no reemplazan sus datos.

Para usar micrófono, cámara web y GPS desde un **teléfono físico**, la aplicación
debe estar publicada mediante **HTTPS** con un certificado válido y accesible
desde el teléfono. `localhost`/`127.0.0.1` sirven para las pruebas locales en
la misma computadora; abrir una dirección HTTP de la red local desde el móvil
no habilita todas esas capacidades. El navegador solicita permisos únicamente
cuando se pulsa grabar, tomar fotografía o usar ubicación. El servidor sigue
escuchando en la interfaz local: este cambio no publica la aplicación en Internet.

Para validar y ejecutar la versión compilada:

```bash
npm test
npm run lint
npm run build
npm run start
```

## Historias implementadas

- **HU-01 — Registro ciudadano:** valida nombre, correo, campos obligatorios y
  coincidencia de contraseñas; normaliza el correo y evita duplicados. El rol
  `citizen` se asigna en el servidor, y el correo municipal está reservado. Las
  contraseñas se verifican con hashes PBKDF2 y sal.
- **HU-02 — Inicio de sesión y rol:** valida credenciales en el servidor y
  dirige cada rol a su vista. Las rutas restringidas se verifican también al
  entrar directamente.
- **HU-03 — Cierre de sesión:** elimina la sesión del archivo JSON, invalida la
  cookie de sesión y vuelve al inicio de sesión.
- **HU-04 — Descripción y categoría:** requiere una descripción no vacía y una
  categoría válida entre Infraestructura, Limpieza y Espacios públicos.
- **HU-05 — Ubicación y envío:** requiere comunidad y referencia, guarda un
  único reporte asociado a la cuenta, genera su identificador, fecha y estado
  inicial `Recibido`, y confirma el resultado con una opción para consultar el
  detalle.
- **HU-06 — Consulta:** muestra solo los reportes propios, del más nuevo al más
  antiguo, y permite consultar el detalle sin modificar el estado.
- **HU-07 — Adjuntar fotografías (SCRUM-14 / RF-08):** permite seleccionar
  hasta tres imágenes JPEG o PNG de hasta 5 MB (5 MiB) cada una. Valida formato,
  tamaño y contenido en el navegador y vuelve a validar tamaño, codificación y
  firma del formato en la API. Los errores conservan los datos y las imágenes
  válidas. Las fotografías son opcionales y se guardan junto con el reporte en
  una única operación idempotente.
- **HU-08 — Revisar, retirar y consultar (SCRUM-15 / RF-09):** muestra vistas
  previas con retiro individual antes del envío, y las fotografías persistidas
  en el detalle ciudadano. Se pueden abrir completas con teclado. Los casos
  anteriores o sin fotografías muestran un mensaje explícito. Solo el dueño o
  una sesión municipal pueden descargar las evidencias.
- **HU-09 — Bandeja municipal:** lista los casos y permite filtrarlos por
  categoría y estado. Incluye doce casos ficticios de demostración; se pueden
  desactivar al iniciar con `REPORTE_CIUDADANO_DEMO_DATA=off`.
- **HU-10 — Detalle municipal:** muestra descripción, ubicación, evidencias,
  categoría, fecha, estado y registro inicial, con acceso restringido por rol.
- **HU-11 — Corregir clasificación (SCRUM-18 / RF-20):** permite elegir una de
  las tres categorías desde el detalle y confirmar o cancelar. El guardado
  conserva todos los demás datos. Al volver a la bandeja se conservan los
  filtros activos y se consultan los resultados actualizados.
- **HU-12 — Actualizar estado y avisar (SCRUM-19 / RF-21 y RF-16):** permite
  confirmar o cancelar cualquiera de los cuatro estados. Cada cambio efectivo
  guarda un evento y un aviso interno para el autor, en la misma escritura
  atómica que actualiza el reporte. Guardar el valor actual no escribe datos.
  Los controles y la API impiden duplicados por clics repetidos o reintentos.
- **HU-13 — Historial de estados:** los detalles ciudadano y municipal
  reutilizan `StatusHistory.jsx` para mostrar el registro inicial y los cambios
  confirmados, con fecha, estado anterior y nuevo.
- **HU-14 — Mis notificaciones (SCRUM-21 / RF-17):** muestra recepción y cambios
  de estado, del más reciente al más antiguo, exclusivamente para la cuenta
  ciudadana en sesión. Cada aviso identifica el caso, su fecha y estado y abre
  el detalle después de guardar su lectura. Distingue «Leída» y «No leída» con
  texto, símbolos y color, e informa cuando la bandeja está vacía o falla una
  operación. La lectura persiste al recargar y volver a ingresar.

### Acceso municipal de demostración

Usá las credenciales ficticias:

- Correo: `municipal@reporteciudadano.cr`
- Contraseña: `Municipal2026!`

En el inicio de sesión se muestra la lista de cuentas registradas. Al elegir
una, se completan el correo y la contraseña de demostración. Las cuentas
ciudadanas existentes guardan su contraseña de demostración después de su
próximo inicio de sesión correcto.

### Cuentas ciudadanas compartidas

Estas cuentas se crean automáticamente en cada copia del repositorio. Todas
usan la contraseña `Ciudadano2026!`:

| Nombre | Correo | Reportes iniciales |
| --- | --- | --- |
| Ana Rojas | `ana.rojas@example.test` | 4 |
| Luis Vargas | `luis.vargas@example.test` | 4 |
| Sofía Mora | `sofia.mora@example.test` | 4 |

Los doce casos incluyen distintos estados, historiales y avisos de recepción
y de cambios. Cada cuenta consulta sus propios casos; la cuenta municipal
puede consultar los doce. Las definiciones están versionadas en
`server/demoData.js`, por lo que un compañero solo necesita obtener los cambios,
ejecutar `npm install` y luego `npm run dev` para disponer de los mismos ejemplos.
También se pueden cargar sin iniciar el servidor con `npm run seed`.

La carga es idempotente: agrega lo que falta, conserva las cuentas personales,
los cambios municipales y las lecturas de avisos, y no duplica casos al reiniciar.
Los casos antiguos de ejemplo se vinculan a estas cuentas sin modificar los
reportes personales. Cada copia conserva sus propias modificaciones; esto no
sincroniza bases entre computadoras. No se debe compartir `data/database.local.json`
ni `.env.local`. Para iniciar sin importar la copia ni agregar ejemplos, configurá
`REPORTE_CIUDADANO_DEMO_DATA=off`; esa opción no elimina datos ya existentes.

### Actualizar los registros compartidos en GitHub

`data/database.json` es la instantánea que recibe quien clona el repositorio.
Incluye los registros exportados de las cuentas existentes además de los doce
casos iniciales. Para actualizarla después de crear nuevos reportes o historiales:

```bash
npm run db:export
git add data/database.json
git commit -m "Actualizar registros compartidos"
git push
```

La exportación conserva cuentas, reportes, fotografías, audios, coordenadas,
historiales y avisos. No exporta sesiones activas y reemplaza las credenciales
personales por claves de prueba: `Ciudadano2026!` para todas las cuentas
ciudadanas compartidas y `Municipal2026!` para las municipales. Las credenciales
y sesiones de tu copia local permanecen intactas. Revisá que las evidencias y
los datos de las personas sean apropiados para compartir antes de exportar.

Una copia local ya existente no se sobrescribe al actualizar Git. Para cargar
de nuevo la instantánea, detené el servidor, guardá un respaldo de
`data/database.local.json`, retiralo de la carpeta `data` y reiniciá la aplicación.
Esto comienza una copia local nueva desde los registros compartidos.

Si actualizás desde una versión anterior que guardaba sus cambios directamente
en `data/database.json`, respaldá ese archivo antes de actualizar el repositorio
y usá ese respaldo como `data/database.local.json` para conservar tus registros.

### Diseño de la interfaz

La interfaz usa CSS propio, sin Tailwind. La paleta azul está inspirada en el
[sitio de la Municipalidad de San Carlos](https://www.munisc.go.cr/), con iconos
SVG consistentes y estilos compartidos para botones, formularios y estados.
La [revisión de diseño](docs/design-review.md) documenta los cambios y la
validación en móvil y escritorio.

## Base de datos JSON

### Captura rápida con voz, GPS y cámara

1. Pulsá **Grabar descripción**, contá lo que sucede y detené la grabación.
   Podés escucharla, retirarla o grabarla de nuevo. Se guarda audio, no una
   transcripción automática; no hay opción para subir archivos de audio.
2. Seleccioná una categoría.
3. Pulsá **Usar mi ubicación actual** y verificá el punto y su precisión. También
   podés tocar el mapa, arrastrar el marcador o mover el mapa con las flechas
   del teclado y pulsar **Marcar el centro del mapa**. La referencia escrita es
   opcional cuando hay un punto seleccionado.
4. Pulsá **Tomar fotografía**, encuadrá y capturá. La cámara se cierra y aparece
   la vista previa. La galería sigue disponible; todas las fotos comparten el
   límite existente de tres imágenes. Si falla el acceso a la cámara web, se
   ofrece el selector de cámara nativo del teléfono.
5. Revisá y enviá. Con audio y ubicación seleccionada no hace falta escribir
   descripción, comunidad ni referencia. Sin audio se exige descripción
   escrita; sin coordenadas se exige comunidad y referencia, como antes.

Las notas de voz tienen un límite de dos minutos y 5 MiB. Se admiten los
contenedores que grabe el navegador en WebM, MP4 u Ogg. El servidor valida el
tamaño, la duración declarada, la codificación y la firma del contenedor; no
transcribe ni recodifica el audio. Las fotografías de cámara se convierten a
JPEG de hasta 1600 píxeles en su lado mayor y se validan igual que las demás.
El micrófono y la cámara liberan sus pistas al detener, cancelar o salir del
formulario. El envío permanece bloqueado mientras se graba o prepara una
captura, y los errores no eliminan los demás campos o evidencias.

Los reportes pueden contener `audio: { type, size, durationSeconds, data }`
(base64 privado) y `location: { latitude, longitude, accuracy? }`, con precisión
en metros cuando proviene del GPS. Son campos opcionales compatibles con la
versión 3 y los reportes anteriores. La API devuelve solo los metadatos y la
URL del audio. `GET /api/reports/:id/audio` exige propietario o rol municipal
y soporta rangos de bytes para reproducción y búsqueda en el audio. Ambas
vistas de detalle muestran el reproductor, el mapa y un enlace para abrir
las coordenadas en Google Maps. Cambiar categoría o estado conserva estas
evidencias y sus coordenadas.

El mapa utiliza exclusivamente Google Maps, con su atribución y sus controles,
y requiere Internet y una clave válida. Si falla, las coordenadas seleccionadas
se conservan y siguen disponibles GPS, texto, dirección y galería. Los audios
y las fotografías permanecen en el servidor local; el visor comparte con
Google la información necesaria para mostrar el área y el punto seleccionados.

### Configurar Google Maps

Cada integrante configura su propia clave. `.env.example` es una plantilla
versionada sin credenciales; Vite no la usa directamente. `.env.local` contiene
los valores de esa computadora y está excluido de Git. No se comparten claves
de Google Maps en el repositorio.

1. Copiá `.env.example` a `.env.local`.
2. Completá `VITE_GOOGLE_MAPS_API_KEY` con una clave de Maps JavaScript API.
   Para este prototipo se puede usar una [Maps Demo Key](https://developers.google.com/maps/documentation/javascript/demo-key),
   sujeta a los requisitos y cuotas de Google, sin ingresar datos de facturación.
   Para una clave estándar se debe habilitar Maps JavaScript API y configurar
   la cuenta del proyecto según [las instrucciones de Google](https://developers.google.com/maps/documentation/javascript/get-api-key).
3. `VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID` sirve para desarrollo; al publicar,
   configurá un Map ID propio para los marcadores avanzados.
4. Reiniciá `npm run dev`. Para la versión compilada volvé a ejecutar
   `npm run build`; las variables `VITE_` se incorporan al cliente al compilar.

La clave web es visible en el navegador: restringila por sitio y por API en
Google Cloud. `.env.local` queda excluido de Git. Sin clave, el componente
muestra un mensaje de indisponibilidad en lugar de un mapa de otro proveedor.
El cargador solicita las bibliotecas de mapa y marcadores una sola vez, en
español y con región Costa Rica. Permite tocar el mapa, arrastrar el marcador,
usar el centro y consultar puntos guardados en ambos detalles.

Referencias: [permisos de captura](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia),
[GPS](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition),
[carga de Google Maps](https://developers.google.com/maps/documentation/javascript/load-maps-js-api) y
[enlaces de Google Maps](https://developers.google.com/maps/documentation/urls/get-started).

### Estructura persistente

`data/database.local.json` es el almacenamiento editable por el servidor.
`data/database.json` es la instantánea versionada que se importa solo al crear
la copia local. Ambos tienen esta estructura:

```json
{
  "version": 3,
  "accounts": [],
  "sessions": [],
  "reports": [],
  "notifications": []
}
```

Las cuentas contienen identificador, nombre, correo, rol, sal y hash de
contraseña. Para permitir autocompletar en esta demostración local, también se
guarda la contraseña de demostración en texto plano; no es seguro para
producción y debe eliminarse al integrar un servicio de autenticación real.
Las sesiones contienen un token aleatorio, el identificador de
cuenta y su vencimiento. Los reportes contienen su identificador, el dueño, la
descripción, categoría, comunidad, referencia, fecha de creación y estado.
Opcionalmente contienen `photos`: una lista de objetos con `id`, `name`,
`type`, `size` y `data` (los bytes codificados en base64). La asociación queda
dentro del reporte, sin archivos huérfanos ni URLs temporales. El guardado
atómico y la clave de idempotencia existentes evitan duplicados por reintentos
o solicitudes concurrentes. El navegador también impide envíos simultáneos.
`server/index.js` migra automáticamente las bases de versión 1 y 2 a versión
3, preservando cuentas, sesiones y reportes y agregando las notificaciones. La API
lee y actualiza el archivo para todas las operaciones.

Las fotografías siguen siendo compatibles con la versión 2: los reportes
anteriores que no tienen `photos` se interpretan como reportes sin evidencias.
No se usa localStorage ni IndexedDB; la persistencia depende del mismo servidor
y archivo JSON que ya utiliza el proyecto. Cerrar sesión, recargar o reiniciar
el servidor conserva los bytes de las imágenes.

Cada reporte puede contener dos colecciones adicionales:

- `statusEvents`: eventos con `id`, `reportId`, `previousStatus`, `newStatus`
  y `createdAt` (fecha ISO con hora). Los reportes anteriores se interpretan
  como una lista vacía; no se inventan cambios históricos.
- `municipalOperations`: comprobantes internos con `key`, `accountId`, `field`
  y `value`. Permiten reconocer un reintento incluso si hubo cambios posteriores,
  evitando que una respuesta de red perdida termine revirtiendo otra operación.

La colección raíz `notifications` contiene `id`, `citizenId`, `reportId`,
`eventId`, `newStatus`, `createdAt`, `url` y `readAt`. El destinatario
siempre proviene del autor almacenado del reporte; la petición no puede elegirlo.
El evento y el aviso comparten fecha y están vinculados por `eventId`. Los casos
de ejemplo de HU-09 pertenecen a las tres cuentas ciudadanas compartidas;
sus avisos no aparecen en las cuentas personales. Al iniciar, los casos antiguos
marcados como ejemplos cuyo autor era `demo-seed` se reasignan a esas cuentas.

HU-14 guarda la recepción junto con el reporte nuevo, en la misma operación
atómica y bajo su clave de idempotencia. Ese aviso usa `eventId: "created"`,
`newStatus: "Recibido"` y la fecha de creación del reporte; su evento corresponde
al registro inicial que HU-13 muestra en el historial. Los avisos de cambio de
estado de HU-12 conservan el identificador de su evento y sus datos originales.

Al iniciar, el servidor completa una recepción faltante por cada reporte cuyo
autor tenga una cuenta ciudadana existente. La migración es idempotente, usa
la fecha original y no modifica reportes ni avisos anteriores. No crea
recepciones para los casos ficticios sin cuenta. La base permanece en versión 3.
Las notificaciones nuevas tienen `readAt: null`; al abrirlas, el servidor
establece una única fecha ISO de lectura. Una segunda apertura conserva esa
fecha y no vuelve a escribir el archivo ni genera avisos o eventos adicionales.

El servidor serializa las escrituras y reemplaza el JSON completo mediante un
archivo temporal. Si el guardado falla, descarta esa modificación y elimina el
temporal: el reporte, el evento, el aviso y el comprobante se guardan juntos o
no se guarda ninguno. Esta garantía supone una única instancia del servidor,
como en el entorno de demostración del proyecto.

## Rutas y puntos de integración

- `/login` y `/registro`: autenticación.
- `/ciudadano`: inicio del ciudadano autenticado.
- `/ciudadano/reportes/nuevo`: formulario de reportes y selección de fotografías.
- `/ciudadano/reportes`: listado de reportes propios.
- `/ciudadano/reportes/:id`: detalle ciudadano con evidencias.
- `/ciudadano/notificaciones`: bandeja privada accesible desde «Mis
  notificaciones» en el menú ciudadano, también disponible para volver desde
  el detalle de un caso. La sesión municipal no puede acceder a esta ruta.
- `/municipal`: vista inicial municipal protegida por rol.
- `/municipal/reportes`: bandeja existente con filtros por categoría y estado.
- `/municipal/reportes/:id`: detalle municipal con controles de gestión.

`server/index.js` expone la API local bajo `/api/auth/*` y `/api/reports`;
`src/services/authService.js` y `src/services/reportService.js` consumen esa
API. `src/App.jsx` centraliza las rutas protegidas y
`src/components/CitizenReports.jsx` contiene el formulario, la confirmación, el
listado, el detalle y la guía de estados. El servidor filtra por cuenta y no
permite al rol municipal listar, leer el detalle completo ni crear reportes
desde esta API.

Las respuestas de reportes incluyen únicamente metadatos de las fotografías,
nunca su base64. Las rutas `GET /api/reports/:id/photos` (metadatos) y
`GET /api/reports/:id/photos/:photoId` (imagen) verifican en el servidor que
la sesión pertenezca al dueño o al rol `municipal`; un ciudadano ajeno recibe
404 y una solicitud sin sesión recibe 401. Las imágenes se sirven con
`Cache-Control: no-store`. Vite bloquea el acceso público a la base JSON y a
sus archivos temporales, incluso por las rutas `/@fs` y las importaciones
`?raw`.

`src/components/PhotoPicker.jsx` implementa la selección y las vistas previas.
`shared/photoRules.js` comparte los límites de tipo y tamaño con el servidor.
`src/components/EvidenceGallery.jsx` recibe la propiedad `photos` y puede
reutilizarse en el futuro detalle municipal con los metadatos de la ruta de
evidencias; HU-10 lo reutiliza en su detalle municipal.

`MunicipalReportActions.jsx` añade los controles a `MunicipalReportDetail.jsx`;
reutiliza las categorías y estados de `shared/reportRules.js`. La ciudadanía
consulta los valores actualizados desde los mismos reportes, sin copias de datos.
Los cuatro estados incluyen texto y las insignias de colores existentes.

La API municipal conserva las rutas de HU-09/HU-10 y añade:

- `PATCH /api/municipal/reports/:id/category`: JSON con `category` y
  `expectedCategory` (valor original mostrado).
- `PATCH /api/municipal/reports/:id/status`: JSON con `status` y
  `expectedStatus`.

Ambas requieren sesión municipal e `Idempotency-Key` (de 16 a 100 caracteres
alfanuméricos, guion o guion bajo). Solo admiten los campos indicados y los
valores compartidos. Responden con `{ report, changed, repeated }`. Si otro
guardado modificó el valor original, responden 409 y la interfaz vuelve a
consultar el caso antes de permitir otra edición. La misma clave y el mismo
valor repiten la respuesta sin guardar de nuevo; reutilizarla para otro valor
se rechaza. Una cuenta ciudadana recibe 403 aunque manipule la petición.

Las funciones de historial y notificaciones utilizan:

- `GET /api/reports/:id/status-events`: eventos del caso, accesibles únicamente
  al propietario o al personal municipal.
- `GET /api/notifications`: avisos exclusivos de la cuenta ciudadana en sesión,
  del más reciente al más antiguo, sin aceptar un destinatario de la petición.
  Cada elemento público añade `type: "received"` o `"status-change"` a los
  datos del aviso; no expone `citizenId`. Si dos avisos comparten fecha exacta,
  los cambios preceden a la recepción y los últimos cambios se muestran primero.
- `PATCH /api/notifications/:id/read`: sin cuerpo requerido. Verifica sesión
  ciudadana y propiedad y guarda `readAt` usando la hora del servidor; responde
  `{ notification }`. No utiliza fechas o destinatarios enviados por el cliente.
  Una solicitud sin sesión recibe 401, un rol municipal 403 y un identificador
  inexistente o ajeno 404. Los errores de guardado no alteran la notificación.
- `getReportStatusEvents()`, `getCitizenNotifications()` y
  `markNotificationRead()` en `src/services/reportService.js`.

`CitizenNotifications.jsx` reutiliza `AppHeader`, los estilos de reportes y las
insignias de estado. La propiedad `url` abre el detalle ciudadano existente,
con su historial de HU-13 y sus fotografías. La interfaz espera la confirmación
del guardado antes de navegar; si falla, conserva el aviso y permite reintentar.
Un bloqueo evita solicitudes simultáneas por clics repetidos. No se envían
correos ni se usan servicios externos.

## Pruebas automatizadas

`tests/capture.test.js` verifica creación mediante voz y coordenadas sin texto,
compatibilidad con los campos manuales, límites y validación de grabaciones,
validación de coordenadas, permisos del audio, rangos de reproducción,
idempotencia y persistencia después de cambios municipales y reinicios.
`tests/fixtures/description.webm` es una grabación generada por MediaRecorder
con un micrófono sintético, sin voces ni datos personales reales. La prueba
en Edge usa dispositivos de captura sintéticos y GPS simulado: comprueba
grabación, reproducción, captura de foto, selección de ubicación, permisos
rechazados, liberación de pistas y recorrido alternativo por texto y galería.
No sustituye la prueba de hardware en un teléfono Android o iPhone físico.
Tras el cambio a Google Maps se comprobó el cargador oficial, selección por
clic y centro, arrastre, GPS, carga única y errores mediante un doble del SDK,
además del caso sin clave. La cartografía real de Google queda pendiente de
verificación con una clave válida; no se utiliza un proveedor alternativo.

`npm test` levanta una instancia aislada con una base JSON temporal y comprueba
validación, creación idempotente, separación de usuarios, autorización
municipal, detalle, orden del listado y consulta de 100 reportes en menos de
dos segundos. Además verifica cero a tres imágenes, ambos formatos, límites
de tamaño (incluidos exactamente 5 MiB), cuarta imagen, archivos falsificados,
codificación inválida, ausencia de reportes parciales, deduplicación,
autorización de metadatos y bytes, compatibilidad con reportes anteriores y
persistencia después de cerrar sesión y reiniciar el servidor. También
comprueba que Vite no exponga la base privada. Usa imágenes pequeñas en
`tests/fixtures/`. La base temporal se elimina al finalizar la ejecución.

`tests/municipal-inbox.test.js` verifica las integraciones de HU-09 y HU-10.
`tests/municipal-updates.test.js` comprueba migración desde versión 2, permisos,
validaciones, sincronización de filtros y consulta ciudadana, conservación de
autor y fotografías, los cuatro estados, avisos separados por cuenta, envíos
concurrentes, reintentos tardíos, ausencia de cambios al guardar el mismo valor
y persistencia al reiniciar. También simula un fallo de reemplazo del JSON en
el proceso de prueba y verifica que no queden datos parciales ni temporales.
Mide que el cambio, el aviso y su consulta estén disponibles en menos de dos
segundos en la base temporal de demostración; no es una garantía de rendimiento
para volúmenes o servidores distintos.

`tests/status-history.test.js` verifica HU-13. `tests/notifications.test.js`
verifica HU-14: recepción inicial atómica e idempotente, avisos coherentes con
el historial, orden, privacidad entre cuentas, roles, lectura repetida y
concurrente, persistencia tras reiniciar, migración sin duplicados y fallos
de almacenamiento tanto al registrar un reporte como al guardar su lectura.
También mide listado de 100 avisos, lectura y consulta de su reporte dentro de
dos segundos en la base temporal local. Las comprobaciones del navegador
cubren apertura con teclado, doble clic, recuperación de errores de carga y
lectura, reingreso, evidencias e historial, y ausencia de desbordamiento a
320, 390, 768, 1024 y 1366 píxeles de ancho. No sustituyen una evaluación formal
de usabilidad con participantes del Sprint 4.

Para revisar la interfaz manualmente, iniciá sesión, completá el formulario y
agregá las tres imágenes de `tests/fixtures/` una a una. Intentá agregar una
cuarta, un archivo de texto y una imagen de más de 5 MB: los campos y las
imágenes válidas deben conservarse. Retirá una imagen, volvé a agregarla y
enviá. Consultá el detalle desde la confirmación y desde Mis reportes, recargá
y volvé a iniciar sesión. Finalmente, retiralas todas y enviá otro reporte:
debe indicar que no tiene fotografías adjuntas. Otra cuenta ciudadana no debe
poder consultar el reporte ni las URLs de sus fotografías.

Para HU-11/HU-12, creá un caso con una cuenta ciudadana y luego ingresá como
municipal. Filtrá por su categoría y estado y abrí su detalle. Probá cancelar
ambas ediciones y confirmar una categoría diferente. Volvé a la bandeja:
debe conservar los filtros y excluir el caso si dejó de coincidir. Cambiá sus
filtros y abrilo otra vez; confirmá un nuevo estado. Volvé a ingresar como
ciudadano y comprobá categoría, estado y fotografías. En «Mis notificaciones»
deben aparecer el aviso de recepción y los cambios de estado. Abrí un aviso,
volvé usando el menú y comprobá su indicación «Leída» después de recargar y
volver a iniciar sesión. Otra cuenta debe mostrar únicamente sus propios
avisos; una cuenta sin reportes debe ver el mensaje de bandeja vacía.

## Alcance y seguridad

Es una base de datos en archivo JSON para demostración local, no un motor de
base de datos para producción. No la uses con datos reales: el archivo contiene
hashes de contraseñas, y la cuenta y contraseña municipal son conocidas. Una
implementación productiva debe usar una base de datos y un servicio de
autenticación apropiados, además de HTTPS y controles de acceso del lado del
servidor.

El base64 aumenta aproximadamente un tercio el espacio ocupado por las
imágenes. Como la base JSON se lee y reescribe completa, esta solución es
adecuada para el prototipo universitario local; un volumen alto de fotografías
requiere separar los archivos en almacenamiento privado y mantener solo sus
metadatos en una base de datos. El servidor verifica la firma JPEG/PNG sin
recodificar imágenes; el navegador comprueba también que puedan decodificarse.
