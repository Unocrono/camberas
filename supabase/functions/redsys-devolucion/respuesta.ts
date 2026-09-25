// Interpretación de la respuesta de Redsys a una devolución (TransactionType 3).
//
// Sin imports: la firma y el decodificado llegan como funciones para poder
// probar este fichero fuera de Deno.
//
// La regla de oro: solo es 'hecha' con una respuesta firmada, del mismo
// pedido, importe, comercio y terminal, y Ds_Response 0900. Solo es
// 'rechazada' si Redsys dice claramente que no la hizo (error SIS0xxx de
// validación o una denegación firmada). Todo lo demás es 'dudosa': no se sabe
// si el dinero salió y un humano lo mira en el portal de Redsys (Canales).

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

// Respuestas firmadas que no dicen si la devolución salió: el emisor o el
// sistema no contestaron a tiempo
const SIN_CONFIRMAR = new Set([909, 912, 9912]);

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

  // Error de validación: Redsys no llegó a procesar la devolución. Llega sin
  // firma, como texto o como lista ({"errorCode":["SIS0042"]})
  if (cuerpo.errorCode !== undefined && cuerpo.errorCode !== null && cuerpo.errorCode !== "") {
    const codigo = Array.isArray(cuerpo.errorCode) ? String(cuerpo.errorCode[0] ?? "") : String(cuerpo.errorCode);
    if (/^SIS\d{4}$/.test(codigo)) {
      return { estado: "rechazada", dsResponse: null, auth: null, errorCode: codigo, respuesta: cuerpo };
    }
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
  // Un código de cobro autorizado (0000-0099) o de anulación (0400) no es lo
  // que contesta Redsys a una devolución: no se da por no hecha, se mira
  if (Number.isNaN(n) || SIN_CONFIRMAR.has(n) || n <= 99 || n === 400) {
    return dudosa(dsResponse || "CAMBERAS_SIN_CODIGO", { params }, dsResponse || null);
  }
  return { estado: "rechazada", dsResponse, auth: null, errorCode: dsResponse, respuesta: params };
}
