// Interpretación de la respuesta de Redsys a una devolución (TransactionType 3).
//
// Sin imports: la firma y el decodificado llegan como funciones para poder
// probar este fichero fuera de Deno.
//
// La regla de oro: solo es 'hecha' con una respuesta firmada, del mismo
// pedido, importe, comercio y terminal, y Ds_Response 0900. Solo es
// 'rechazada' si Redsys dice claramente que no la hizo: un SIS de la lista de
// validación previa (SIS_RECHAZO_SEGURO) o una denegación firmada de la lista
// (esDenegacionClara). Todo lo demás es 'dudosa', también cualquier código que
// no esté en esas listas: no se sabe si el dinero salió y un humano lo mira en
// el portal de Redsys (Canales). Una 'rechazada' libera el tope y deja pedir
// otra devolución; una 'dudosa' de más solo cuesta mirar Canales.

export type EstadoDevolucion = "hecha" | "rechazada" | "dudosa";

export interface Resultado {
  estado: EstadoDevolucion;
  dsResponse: string | null;
  auth: string | null;
  errorCode: string | null;
  respuesta: Record<string, unknown>;
}

export interface Esperado {
  order: string;
  importeCent: number;
  fuc: string;
  terminal: string;
}

// Errores SIS que Redsys da AL VALIDAR la petición, antes de procesarla:
// faltan campos o tienen mal formato, comercio/terminal/firma no válidos, o
// la devolución no se admite (no existe el cobro, supera lo cobrado, fuera de
// plazo...). Con ellos es seguro decir que no se ha movido dinero. Los de
// sistema o genéricos (SIS0034 acceso a BD, SIS0264 procesando la respuesta,
// "consulte con soporte"...) NO están: no dicen si la devolución llegó a
// hacerse y quedan 'dudosa'.
const SIS_RECHAZO_SEGURO = new Set([
  // Campos que faltan o con formato erróneo
  "SIS0008", "SIS0009", "SIS0010", "SIS0011", "SIS0014", "SIS0015", "SIS0016",
  "SIS0018", "SIS0019", "SIS0020", "SIS0021", "SIS0022", "SIS0023",
  "SIS0074", "SIS0075", "SIS0076",
  "SIS0429", "SIS0430", "SIS0431", "SIS0432", "SIS0433", "SIS0434",
  // Comercio o terminal inexistente, de baja o con otra moneda
  "SIS0026", "SIS0027", "SIS0028",
  // Firma que no cuadra
  "SIS0041", "SIS0042", "SIS0412", "SIS0444",
  // Tipo de operación no permitido
  "SIS0112", "SIS0274",
  // La devolución no se admite (los que explica el panel)
  "SIS0054", "SIS0056", "SIS0057", "SIS0214", "SIS0268", "SIS0417", "SIS0626",
  // Duplicidad: Redsys pide repetir pasado un minuto, esta petición no se hizo
  "SIS0295",
]);

// Ds_Response firmados que son una denegación clara: el emisor o Redsys dicen
// que no. 0101-0299 son las denegaciones del emisor; 0904 comercio no
// registrado, 0913 pedido repetido, 0944 sesión incorrecta, 0950 devolución no
// permitida. Cualquier otro (0400, 0481, 0909, 0912, 9912, 99xx, 82xx o uno
// desconocido) queda 'dudosa'.
const DENEGACION_CLARA = new Set([904, 913, 944, 950]);
const esDenegacionClara = (n: number) => (n >= 101 && n <= 299) || DENEGACION_CLARA.has(n);

const normalizar = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/").replace(/=/g, "");

function igualesSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function interpretarRespuesta(
  httpStatus: number,
  texto: string,
  esperado: Esperado,
  firmar: (parametrosB64: string, order: string) => string,
  decodificar: (b64: string) => string,
): Resultado {
  const recorte = texto.slice(0, 2000);
  const dudosa = (
    errorCode: string,
    respuesta: Record<string, unknown>,
    dsResponse: string | null = null,
  ): Resultado => ({ estado: "dudosa", dsResponse, auth: null, errorCode, respuesta });

  if (httpStatus !== 200) return dudosa(`CAMBERAS_HTTP_${httpStatus}`, { texto: recorte });

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = JSON.parse(texto);
  } catch {
    return dudosa("CAMBERAS_NO_JSON", { texto: recorte });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return dudosa("CAMBERAS_NO_JSON", { texto: recorte });
  }

  // Error SIS: llega sin firma, como texto o como lista ({"errorCode":["SIS0042"]}).
  // Solo los de validación previa dicen que Redsys no la procesó; el resto
  // (de sistema, genéricos, desconocidos) queda 'dudosa' con su código
  if (cuerpo.errorCode !== undefined && cuerpo.errorCode !== null && cuerpo.errorCode !== "") {
    const codigo = Array.isArray(cuerpo.errorCode) ? String(cuerpo.errorCode[0] ?? "") : String(cuerpo.errorCode);
    if (SIS_RECHAZO_SEGURO.has(codigo)) {
      return { estado: "rechazada", dsResponse: null, auth: null, errorCode: codigo, respuesta: cuerpo };
    }
    if (/^SIS\d{4}$/.test(codigo)) return dudosa(codigo, cuerpo);
    return dudosa("CAMBERAS_ERROR_DESCONOCIDO", cuerpo);
  }

  const params64 = cuerpo.Ds_MerchantParameters;
  const firma = cuerpo.Ds_Signature;
  if (typeof params64 !== "string" || typeof firma !== "string" || !params64 || !firma) {
    return dudosa("CAMBERAS_SIN_PARAMETROS", cuerpo);
  }
  // Pedimos con V1; una respuesta en otra versión no se puede verificar así
  if (cuerpo.Ds_SignatureVersion !== undefined && cuerpo.Ds_SignatureVersion !== "HMAC_SHA256_V1") {
    return dudosa("CAMBERAS_VERSION_FIRMA", cuerpo);
  }

  let params: Record<string, unknown>;
  try {
    params = JSON.parse(decodificar(params64));
  } catch {
    return dudosa("CAMBERAS_PARAMETROS", cuerpo);
  }
  if (!params || typeof params !== "object") return dudosa("CAMBERAS_PARAMETROS", cuerpo);

  // La firma de la respuesta se calcula con el pedido QUE TRAE la respuesta y
  // sobre los parámetros tal como llegaron
  const orden = String(params.Ds_Order ?? params.DS_ORDER ?? "");
  let calculada = "";
  try {
    calculada = orden ? firmar(params64, orden) : "";
  } catch {
    calculada = "";
  }
  if (!calculada || !igualesSeguro(normalizar(calculada), normalizar(firma))) {
    return dudosa("CAMBERAS_FIRMA", { params });
  }

  const dsResponse = String(params.Ds_Response ?? params.DS_RESPONSE ?? "");
  // Comercio y terminal como números: el cobro guardó '001' y Redsys contesta '1'
  const cuadra =
    orden === esperado.order &&
    Number(params.Ds_Amount ?? params.DS_AMOUNT) === esperado.importeCent &&
    Number(params.Ds_MerchantCode ?? params.DS_MERCHANTCODE) === Number(esperado.fuc) &&
    Number(params.Ds_Terminal ?? params.DS_TERMINAL) === Number(esperado.terminal);
  if (!cuadra) return dudosa("CAMBERAS_NO_CUADRA", { params }, dsResponse || null);

  const n = /^\d+$/.test(dsResponse) ? parseInt(dsResponse, 10) : NaN;
  if (n === 900) {
    const auth = String(params.Ds_AuthorisationCode ?? params.DS_AUTHORISATIONCODE ?? "").trim();
    return { estado: "hecha", dsResponse, auth: auth || null, errorCode: null, respuesta: params };
  }
  if (!Number.isNaN(n) && esDenegacionClara(n)) {
    return { estado: "rechazada", dsResponse, auth: null, errorCode: dsResponse, respuesta: params };
  }
  // Todo lo demás no dice si la devolución salió: un código de cobro
  // autorizado (0000-0099) o de anulación (0400, 0481), el emisor o el sistema
  // sin contestar (0909, 0912, 9912), uno en proceso o uno desconocido
  return dudosa(dsResponse || "CAMBERAS_SIN_CODIGO", { params }, dsResponse || null);
}
