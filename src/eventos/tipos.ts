/**
 * Tipos del evento público: lo que devuelve la RPC evento_publico(slug)
 * (supabase/migrations/20260924180000_web_propia_dominios_y_tpv.sql), con la
 * forma de docs/eventos/evento.schema.json. Claves en español, las mismas que
 * usa la plantilla de la web de la carrera.
 *
 * La RPC pasa el resultado por jsonb_strip_nulls: un dato que no existe NO
 * viene a null, directamente no está. Por eso casi todo es opcional.
 */

export type EstadoEvento = "abierta" | "proximamente" | "cerrada" | "agotada" | "celebrada" | "borrador" | "suspendida";
export type TipoPrueba = "carrera" | "marcha" | "infantil" | "relevos" | "km_vertical";

export interface Periodo {
  desde?: string;
  hasta?: string;
  precio: number;
  etiqueta?: string;
  vigente?: boolean;
}

export interface Tarifa {
  /** Id del recorrido (race_distances.id) cuando viene de Camberas */
  id: string;
  nombre: string;
  pruebas: string[];
  /** Precio vigente ahora mismo (lo calcula el servidor) */
  precio?: number;
  periodos: Periodo[];
  modalidad?: string;
  condicion?: Record<string, unknown>;
  incluye?: string[];
  destacada?: boolean;
}

export interface CampoFormulario {
  id: string;
  nombre: string;
  etiqueta: string;
  tipo: string;
  opciones?: unknown;
  obligatorio?: boolean;
  sistema?: boolean;
  ayuda?: string;
  placeholder?: string;
  /** Recorrido al que pertenece; sin él, es de toda la carrera */
  prueba?: string;
  dependeDe?: string;
  dependeValor?: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  corto?: string;
  sexo?: string;
  edadMin?: number;
  edadMax?: number;
  criterio?: string;
}

export interface Avituallamiento {
  km: number;
  nombre: string;
  lugar?: string;
  /** liquido | completo | start | finish | standard (checkpoints de Camberas) */
  tipo: string;
  corte?: string;
  limite?: string;
}

export interface Prueba {
  id: string;
  nombre: string;
  tipo: TipoPrueba;
  competitiva?: boolean;
  chip?: boolean;
  /** metros */
  distancia?: number;
  distanciaTexto?: string;
  desnivelPos?: number;
  desnivelNeg?: number;
  altMax?: number;
  altMin?: number;
  /** "HH:MM" */
  salida?: string;
  limite?: string;
  lugarSalida?: string;
  lugarMeta?: string;
  color?: string;
  marcaje?: string;
  municipios?: string;
  descripcion?: string;
  plazas?: number;
  plazasLibres?: number;
  estado?: EstadoEvento;
  precio?: number;
  apertura?: string;
  cierre?: string;
  imagen?: string;
  terreno?: [string, string][];
  track?: { gpx?: string; wikiloc?: string; mapa?: string };
  categorias?: Categoria[];
  avituallamientos?: Avituallamiento[];
}

export interface ItemPrograma {
  fecha?: string;
  hora?: string;
  horaFin?: string;
  titulo: string;
  lugar?: string;
}

export interface Premio {
  pruebas?: string[];
  categoria?: string;
  premio: string;
  texto?: string;
}

export interface Servicio {
  nombre: string;
  texto?: string;
  icono?: string;
}

export interface Patrocinador {
  nombre: string;
  logo?: string;
  web?: string;
  nivel?: "organiza" | "principal" | "institucional" | "beneficiario" | "colaborador";
}

export interface Documento {
  nombre: string;
  url: string;
  tipo?: string;
}

export interface EventoPublico {
  id: string;
  slug: string;
  tenant?: string;
  nombre: string;
  nombreCorto?: string;
  edicion?: number;
  subtitulo?: string;
  descripcion?: string;
  deporte?: string;
  competitivo?: boolean;
  federacion?: string;
  fecha: string;
  fechaTexto?: string;
  lugar: {
    nombre?: string;
    direccion?: string;
    municipio?: string;
    provincia?: string;
    zona?: string;
    municipios?: string[];
    mapaUrl?: string;
  };
  organizador: {
    nombre?: string;
    email?: string;
    web?: string;
    telefono?: string;
    razonSocial?: string;
    cif?: string;
    direccion?: string;
  };
  beneficiario?: { nombre: string; web?: string; texto?: string; logo?: string };
  estado: EstadoEvento;
  imagenes: Record<string, string>;
  web: { plantilla: string; activa: boolean; dominio?: string; tpvPropio?: boolean };
  /** Libro de diseño (race_web.tema): lo valida src/plantillas/libroDiseno.ts */
  marca?: unknown;
  inscripcion: {
    apertura?: string;
    cierre?: string;
    cierreTexto?: string;
    limiteDorsales?: number;
    plazasDisponibles?: number;
    mostrarPlazas?: boolean;
    edadMinima?: number;
    modalidades: string[];
    tarifas: Tarifa[];
    equipo?: { minMiembros: number; tipo: string; valor: number }[] | { tamano?: number };
    devolucion?: { diasAntes: number; porcentaje: number }[] | { hasta?: string; gastos?: number; texto?: string };
    cupones?: boolean;
    campos: CampoFormulario[];
    incluye?: string[];
    nota?: string;
    pasarela?: { proveedor?: string; url?: string; metodos?: string[] };
  };
  pruebas: Prueba[];
  categorias?: Categoria[];
  reglamento?: {
    url?: string;
    version?: number;
    secciones?: { titulo: string; tipo?: string; texto: string }[];
    materialObligatorio?: string[];
    normasMaterial?: string;
    marcaje?: string[];
    normas?: string[];
    reclamaciones?: string;
  };
  programa?: ItemPrograma[];
  dorsales?: { lugar?: string; horarios?: [string, string][]; nota?: string };
  premios?: Premio[];
  entregaPremios?: string;
  servicios?: Servicio[];
  camiseta?: { incluida?: boolean; precio?: number; hasta?: string; limite?: number; tallas?: string[]; texto?: string; imagen?: string };
  sanitario?: { medios?: [string, string][]; nota?: string };
  medioAmbiente?: { espacio?: string; habitats?: string; especies?: string; normas?: string; adhesion?: string };
  infoPractica?: {
    comoLlegar?: string;
    parking?: string;
    alojamiento?: string;
    espectadores?: string;
    transporte?: string;
    faq?: { p: string; r: string }[];
  };
  clasificaciones?: { url?: string; tiempoReal?: boolean; anteriores?: { anio: number; url: string }[] };
  gps?: { activo?: boolean; url?: string };
  fotos?: { url?: string; disponible?: boolean; texto?: string };
  patrocinadores?: Patrocinador[];
  contacto?: { email?: string; emailDatos?: string; telefono?: string; direccion?: string; redes?: Record<string, string> };
  documentos?: Documento[];
  seo?: { titulo?: string; descripcion?: string };
  analytics?: { ga4?: string };
  servicios_tecnicos?: { proveedor?: string; texto?: string };
}

/** Respuesta de estado_inscripcion_publica(id) */
export interface EstadoInscripcionPublica {
  estado: "pagada" | "pendiente" | "fallida" | "anulada" | "no_existe";
  dorsal?: number | null;
  prueba?: string;
  carrera?: string;
  slug?: string;
}

/** Respuesta de carrera_por_dominio(hostname) */
export interface CarreraPorDominio {
  race_id: string;
  slug: string;
  nombre: string;
  logo?: string | null;
  hostname: string;
  verificado: boolean;
  plantilla: string;
  tema: unknown;
}
