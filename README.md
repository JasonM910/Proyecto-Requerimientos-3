# Reporte Ciudadano

Prototipo evolutivo del curso de Requerimientos de Software del Tecnológico de
Costa Rica. Incluye las seis historias del Sprint 1 y las historias HU-07 y
HU-08 del Sprint 2: selección, revisión y consulta de evidencias fotográficas.

## Requisitos y ejecución

Necesitás Node.js compatible con Vite 8. No se requieren dependencias
adicionales para el servidor ni para la base JSON.

```bash
npm install
npm run dev
```

La aplicación y su API local estarán disponibles en `http://127.0.0.1:5173`.
El primer inicio crea `data/database.json` automáticamente y agrega la cuenta
municipal de demostración. El archivo se mantiene local y no se incluye en Git.

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

### Acceso municipal de demostración

Usá las credenciales ficticias:

- Correo: `municipal@reporteciudadano.cr`
- Contraseña: `Municipal2026!`

En el inicio de sesión se muestra la lista de cuentas registradas. Al elegir
una, se completan el correo y la contraseña de demostración. Las cuentas
ciudadanas existentes guardan su contraseña de demostración después de su
próximo inicio de sesión correcto.

## Base de datos JSON

`data/database.json` es el almacenamiento local editable por el servidor. Tiene
esta estructura:

```json
{
  "version": 2,
  "accounts": [],
  "sessions": [],
  "reports": []
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
`server/index.js` migra automáticamente la base previa de versión 1 a versión
2, preservando cuentas y sesiones y agregando la colección de reportes. La API
lee y actualiza el archivo para todas las operaciones.

Las fotografías son una ampliación compatible de la versión 2: los reportes
anteriores que no tienen `photos` se interpretan como reportes sin evidencias.
No se usa localStorage ni IndexedDB; la persistencia depende del mismo servidor
y archivo JSON que ya utiliza el proyecto. Cerrar sesión, recargar o reiniciar
el servidor conserva los bytes de las imágenes.

## Rutas y puntos de integración

- `/login` y `/registro`: autenticación.
- `/ciudadano`: inicio del ciudadano autenticado.
- `/ciudadano/reportes/nuevo`: formulario de reportes y selección de fotografías.
- `/ciudadano/reportes`: listado de reportes propios.
- `/ciudadano/reportes/:id`: detalle ciudadano con evidencias.
- `/municipal`: vista inicial municipal protegida por rol.

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
evidencias. Este incremento no implementa HU-09 ni HU-10.

Los cuatro estados se explican en la interfaz. En este sprint solo se asigna
`Recibido`; `En revisión`, `En proceso` y `Resuelto` son etapas informativas
para entregas posteriores.

## Pruebas automatizadas

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

Para revisar la interfaz manualmente, iniciá sesión, completá el formulario y
agregá las tres imágenes de `tests/fixtures/` una a una. Intentá agregar una
cuarta, un archivo de texto y una imagen de más de 5 MB: los campos y las
imágenes válidas deben conservarse. Retirá una imagen, volvé a agregarla y
enviá. Consultá el detalle desde la confirmación y desde Mis reportes, recargá
y volvé a iniciar sesión. Finalmente, retiralas todas y enviá otro reporte:
debe indicar que no tiene fotografías adjuntas. Otra cuenta ciudadana no debe
poder consultar el reporte ni las URLs de sus fotografías.

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
