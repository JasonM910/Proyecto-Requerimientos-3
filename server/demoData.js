// Datos ficticios de una municipalidad de demostración (HU-09 / RF-18).
// No corresponden a personas, lugares ni cuentas reales. Los reportes quedan
// marcados con `demo: true` y pertenecen a las cuentas de ejemplo compartidas.
export const DEMO_CITIZEN_ID = 'demo-seed'

export const DEMO_CITIZEN_ACCOUNTS = [
  { id: 'sample-citizen-ana', name: 'Ana Rojas', email: 'ana.rojas@example.test', password: 'Ciudadano2026!' },
  { id: 'sample-citizen-luis', name: 'Luis Vargas', email: 'luis.vargas@example.test', password: 'Ciudadano2026!' },
  { id: 'sample-citizen-sofia', name: 'Sofía Mora', email: 'sofia.mora@example.test', password: 'Ciudadano2026!' },
]

const DEMO_REPORTS = [
  ['RC-20261028-D0000001', 'Infraestructura', 'Barrio Los Laureles', 'Frente a la escuela, calle principal', 'Hueco profundo en la calzada que dificulta el paso de vehículos.', '2026-10-28T14:05:00.000Z', 'Resuelto'],
  ['RC-20261030-D0000002', 'Limpieza', 'Villa Esperanza', 'Lote baldío junto al salón comunal', 'Acumulación de basura y escombros en el lote baldío.', '2026-10-30T09:40:00.000Z', 'Resuelto'],
  ['RC-20261102-D0000003', 'Espacios públicos', 'San Isidro Norte', 'Parque infantil, costado este', 'Juegos del parque con piezas sueltas que representan un riesgo.', '2026-11-02T16:20:00.000Z', 'En proceso'],
  ['RC-20261104-D0000004', 'Infraestructura', 'Urbanización El Mirador', 'Esquina del tanque de agua', 'Alcantarilla sin tapa en la esquina.', '2026-11-04T11:15:00.000Z', 'En proceso'],
  ['RC-20261105-D0000005', 'Limpieza', 'Barrio Los Laureles', 'Parada de autobús sobre la calle principal', 'Basura desbordada alrededor de los contenedores de la parada.', '2026-11-05T07:55:00.000Z', 'En revisión'],
  ['RC-20261107-D0000006', 'Espacios públicos', 'Villa Esperanza', 'Cancha multiuso, entrada sur', 'Iluminación de la cancha apagada desde hace varias noches.', '2026-11-07T19:30:00.000Z', 'En revisión'],
  ['RC-20261109-D0000007', 'Infraestructura', 'San Isidro Norte', 'Puente peatonal sobre la quebrada', 'Barandal del puente peatonal dañado.', '2026-11-09T13:10:00.000Z', 'Recibido'],
  ['RC-20261110-D0000008', 'Limpieza', 'Urbanización El Mirador', 'Zona verde detrás de las casas', 'Maleza alta y residuos en la zona verde comunal.', '2026-11-10T08:25:00.000Z', 'Recibido'],
  ['RC-20261112-D0000009', 'Espacios públicos', 'Barrio Los Laureles', 'Plaza central, junto a la fuente', 'Bancas de la plaza rotas y sin pintura.', '2026-11-12T15:45:00.000Z', 'Recibido'],
  ['RC-20261113-D0000010', 'Infraestructura', 'Villa Esperanza', 'Calle 3, frente a la pulpería', 'Aceras levantadas por las raíces de un árbol.', '2026-11-13T10:00:00.000Z', 'Recibido'],
  ['RC-20261114-D0000011', 'Limpieza', 'San Isidro Norte', 'Río seco, bajo el puente', 'Residuos voluminosos abandonados bajo el puente.', '2026-11-14T17:35:00.000Z', 'Recibido'],
  ['RC-20261115-D0000012', 'Infraestructura', 'Urbanización El Mirador', 'Entrada principal de la urbanización', 'Señal de alto caída y sin visibilidad en el cruce.', '2026-11-15T12:50:00.000Z', 'Recibido'],
]

// HU-13: los reportes ficticios con un estado distinto de «Recibido» incluyen
// los cambios que habrían llevado a ese estado, para que su historial sea
// coherente con el estado que muestran la bandeja y los detalles.
const DEMO_STATUS_PATH = ['Recibido', 'En revisión', 'En proceso', 'Resuelto']
const DEMO_STEP_DELAYS_MS = [3 * 3600_000, 27 * 3600_000, 74 * 3600_000]

export function createDemoStatusEvents(report) {
  const target = DEMO_STATUS_PATH.indexOf(report.status)
  const events = []
  let moment = Date.parse(report.createdAt)
  for (let step = 1; step <= target; step += 1) {
    moment += DEMO_STEP_DELAYS_MS[step - 1]
    events.push({
      id: `demo-event-${report.id}-${step}`,
      reportId: report.id,
      previousStatus: DEMO_STATUS_PATH[step - 1],
      newStatus: DEMO_STATUS_PATH[step],
      createdAt: new Date(moment).toISOString(),
    })
  }
  return events
}

export function createDemoReports() {
  return DEMO_REPORTS.map(
    ([id, category, community, locationReference, description, createdAt, status], index) => {
      const report = {
        id,
        citizenId: DEMO_CITIZEN_ACCOUNTS[index % DEMO_CITIZEN_ACCOUNTS.length].id,
        idempotencyKey: `demo-${id}`,
        description,
        category,
        community,
        locationReference,
        createdAt,
        status,
        photos: [],
        demo: true,
      }
      report.statusEvents = createDemoStatusEvents(report)
      return report
    },
  )
}
