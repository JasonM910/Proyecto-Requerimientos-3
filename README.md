# Reporte Ciudadano

Prototipo evolutivo del curso de Requerimientos de Software del Tecnológico de
Costa Rica. El incremento actual implementa registro e inicio de sesión,
validación del rol y cierre de sesión.

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
`server/index.js` migra automáticamente la base previa de versión 1 a versión
2, preservando cuentas y sesiones y agregando la colección de reportes. La API
lee y actualiza el archivo para todas las operaciones.

## Rutas y puntos de integración

- `/login` y `/registro`: autenticación.
- `/ciudadano`: inicio del ciudadano autenticado.
- `/ciudadano/reportes/nuevo`: espacio reservado para crear y enviar reportes.
- `/ciudadano/reportes`: espacio reservado para consultar reportes.
- `/municipal`: vista inicial municipal protegida por rol.

`server/index.js` expone la API local bajo `/api/auth/*` y `/api/reports`;
`src/services/authService.js` y `src/services/reportService.js` consumen esa
API. `src/App.jsx` centraliza las rutas protegidas y
`src/components/CitizenReports.jsx` contiene el formulario, la confirmación, el
listado, el detalle y la guía de estados. El servidor filtra por cuenta y no
permite al rol municipal leer ni crear reportes desde esta API.

Los cuatro estados se explican en la interfaz. En este sprint solo se asigna
`Recibido`; `En revisión`, `En proceso` y `Resuelto` son etapas informativas
para entregas posteriores.

## Pruebas automatizadas

`npm test` levanta una instancia aislada con una base JSON temporal y comprueba
validación, creación idempotente, separación de usuarios, autorización
municipal, detalle, orden del listado y consulta de 100 reportes en menos de
dos segundos. La base temporal se elimina al finalizar la ejecución.

## Alcance y seguridad

Es una base de datos en archivo JSON para demostración local, no un motor de
base de datos para producción. No la uses con datos reales: el archivo contiene
hashes de contraseñas, y la cuenta y contraseña municipal son conocidas. Una
implementación productiva debe usar una base de datos y un servicio de
autenticación apropiados, además de HTTPS y controles de acceso del lado del
servidor.
