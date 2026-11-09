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
npm run lint
npm run build
npm run start
```

## Historias implementadas

- **HU-01 — Registro ciudadano:** valida nombre, correo, campos obligatorios y
  coincidencia de contraseñas; normaliza el correo y evita duplicados. El rol
  `citizen` se asigna en el servidor, y el correo municipal está reservado. Las
  contraseñas se guardan como hashes PBKDF2 con sal, nunca como texto plano.
- **HU-02 — Inicio de sesión y rol:** valida credenciales en el servidor y
  dirige cada rol a su vista. Las rutas restringidas se verifican también al
  entrar directamente.
- **HU-03 — Cierre de sesión:** elimina la sesión del archivo JSON, invalida la
  cookie de sesión y vuelve al inicio de sesión.

### Acceso municipal de demostración

Usá las credenciales ficticias:

- Correo: `municipal@reporteciudadano.cr`
- Contraseña: `Municipal2026!`

En el inicio de sesión, el botón **Completar datos de acceso** llena ambos
campos.

## Base de datos JSON

`data/database.json` es el almacenamiento local editable por el servidor. Tiene
esta estructura:

```json
{
  "version": 1,
  "accounts": [],
  "sessions": []
}
```

Las cuentas contienen identificador, nombre, correo, rol, sal y hash de
contraseña. Las sesiones contienen un token aleatorio, el identificador de
cuenta y su vencimiento. La API lee y actualiza este archivo para todas las
operaciones de registro, inicio, recuperación y cierre de sesión. El archivo
base inicial está en `data/database.example.json`; los datos creados durante el
uso se guardan únicamente en `data/database.json`.

## Rutas y puntos de integración

- `/login` y `/registro`: autenticación.
- `/ciudadano`: inicio del ciudadano autenticado.
- `/ciudadano/reportes/nuevo`: espacio reservado para crear y enviar reportes.
- `/ciudadano/reportes`: espacio reservado para consultar reportes.
- `/municipal`: vista inicial municipal protegida por rol.

`server/index.js` expone la API local bajo `/api/auth/*` y administra la base
JSON; `src/services/authService.js` consume esa API. `src/App.jsx` centraliza
las rutas protegidas. `src/components/ReportIntegrationPlaceholder.jsx`
contiene los espacios reservados. Para añadir reportes más adelante, el servidor
puede extender el esquema JSON y validar que cada reporte pertenezca al
identificador ciudadano correspondiente.

## Alcance y seguridad

Es una base de datos en archivo JSON para demostración local, no un motor de
base de datos para producción. No la uses con datos reales: el archivo contiene
hashes de contraseñas, y la cuenta y contraseña municipal son conocidas. Una
implementación productiva debe usar una base de datos y un servicio de
autenticación apropiados, además de HTTPS y controles de acceso del lado del
servidor.
