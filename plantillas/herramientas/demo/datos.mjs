/**
 * Datos simulados de la carrera demo de Camberas, para grabar la app sin
 * tocar la base de datos de verdad. Nada de esto sale de producción: son
 * nombres y cifras inventadas con forma creíble.
 */
export const CARRERA = {
  id: 'c0000000-0000-4000-8000-000000000001',
  name: 'Camberas Demo Trail',
  date: '2027-03-14',
  slug: 'camberas-demo-trail',
  cover_image_url: null, image_url: null, logo_url: null,
  location: 'Cabezón de la Sal, Cantabria',
  status: 'published',
};

export const DISTANCIAS = [
  { id: 'd1', race_id: CARRERA.id, name: 'Trail 21K', distance_km: 21, price: 25,
    bib_start: 1, bib_end: 400, next_bib: 212, elevation_gain: 980 },
  { id: 'd2', race_id: CARRERA.id, name: 'Marcha 11K', distance_km: 11, price: 15,
    bib_start: 401, bib_end: 700, next_bib: 468, elevation_gain: 420 },
];

const NOMBRES = [
  ['Lucía', 'Arce'], ['Mateo', 'Villar'], ['Ane', 'Zubiri'], ['Bruno', 'Cela'],
  ['Nerea', 'Olmo'], ['Iker', 'Sanz'], ['Carla', 'Ibáñez'], ['Unai', 'Prado'],
  ['Marta', 'Reyes'], ['Hugo', 'Quintana'], ['Sara', 'Lamas'], ['Jon', 'Treviño'],
];

export const INSCRITOS = NOMBRES.map(([nombre, apellido], i) => ({
  id: `r${i + 1}`,
  race_id: CARRERA.id,
  race_distance_id: i % 3 === 0 ? 'd2' : 'd1',
  bib_number: i % 3 === 0 ? 401 + i : 201 + i,
  first_name: nombre,
  last_name: apellido,
  email: `${nombre.toLowerCase()}@ejemplo.com`,
  payment_status: i === 11 ? 'pending' : 'paid',
  created_at: new Date(Date.now() - i * 36e5).toISOString(),
}));

export const VOLUNTARIOS = [
  { id: 'v1', full_name: 'Rosa Celis', phone: '600 11 22 33', dni: '', email: '',
    driving_license: 'B', vehicle: 'Dacia Duster', plate: '1234 KLM', active: true, notes: '' },
  { id: 'v2', full_name: 'Diego Mena', phone: '600 44 55 66', dni: '', email: '',
    driving_license: 'B', vehicle: 'Furgoneta', plate: '5678 PQR', active: true, notes: '' },
  { id: 'v3', full_name: 'Paula Riaño', phone: '600 77 88 99', dni: '', email: '',
    driving_license: '', vehicle: '', plate: '', active: true, notes: '' },
];

export const DOCUMENTOS = [
  { id: 'doc1', race_id: CARRERA.id, nombre: 'Autorización del ayuntamiento',
    estado: 'concedido', fecha_caducidad: '2027-03-20' },
  { id: 'doc2', race_id: CARRERA.id, nombre: 'Seguro de responsabilidad civil',
    estado: 'presentado', fecha_caducidad: '2027-06-01' },
  { id: 'doc3', race_id: CARRERA.id, nombre: 'ETRAZA · Dirección General de Tráfico',
    estado: 'pedido', fecha_caducidad: null },
];

/** Lo que devuelve get_organizer_race_summary, la portada de /org. */
export const RESUMEN = {
  total_registrations: 248,
  paid_registrations: 241,
  pending_registrations: 7,
  revenue_total: 5420,
  registrations_today: 9,
  revenue_today: 205,
  by_distance: [
    { distance_id: 'd1', name: 'Trail 21K', distance_km: 21, max_participants: 400,
      count: 166, paid: 162, revenue: 4050 },
    { distance_id: 'd2', name: 'Marcha 11K', distance_km: 11, max_participants: 300,
      count: 82, paid: 79, revenue: 1370 },
  ],
  by_source: [
    { source: 'Web de la carrera', count: 171, paid: 167, revenue: 3760 },
    { source: 'Camberas', count: 77, paid: 74, revenue: 1660 },
  ],
  last_registrations: INSCRITOS.slice(0, 6).map((r) => ({
    first_name: r.first_name,
    last_name: r.last_name,
    created_at: r.created_at,
    payment_status: r.payment_status,
    bib_number: r.bib_number,
    distance_name: r.race_distance_id === 'd1' ? 'Trail 21K' : 'Marcha 11K',
    amount: r.race_distance_id === 'd1' ? 25 : 15,
  })),
};

/** RPC → lo que contesta. El resto responde lista vacía. */
export const RPCS = {
  get_organizer_race_summary: RESUMEN,
};

/** Tabla → filas. El resto responde lista vacía. */
export const TABLAS = {
  races: [CARRERA],
  race_distances: DISTANCIAS,
  registrations: INSCRITOS,
  volunteers: VOLUNTARIOS,
  race_documents: DOCUMENTOS,
  race_motos: [
    { id: 'm1', name: 'Escoba', color: '#EC7C2B', moto_order: 1, race_distance_id: 'd1' },
    { id: 'm2', name: 'Ambulancia', color: '#D91F10', moto_order: 2, race_distance_id: 'd1' },
    { id: 'm3', name: 'Cámara runner', color: '#C8E85C', moto_order: 3, race_distance_id: 'd1' },
  ],
};
