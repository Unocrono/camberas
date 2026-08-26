# Tokens Camberas — formato unificado

Un token identifica a un **puesto o dispositivo** (dorsal, moto, punto de
cronometraje), **nunca a una persona**. Es la credencial: quien lo tiene, es
ese puesto. Por eso se reparte como QR y se puede revocar y regenerar.

## Lectura: un único módulo

`src/lib/camberasToken.ts` — **copia idéntica** en los tres repos:

| Repo | Ruta |
|---|---|
| camberas (web) | `src/lib/camberasToken.ts` |
| camberas-track | `src/lib/camberasToken.ts` |
| camberas-motos | `src/utils/camberasToken.ts` |

> Si tocas uno, toca los tres. No vuelvas a escribir el regex del UUID suelto:
> antes de unificar había cuatro copias y cada una aceptaba cosas distintas.

```ts
parseCamberasToken(raw): CamberasToken | null   // tolerante, devuelve null si no hay token
requireCamberasToken(raw): CamberasToken        // lanza con mensaje para la interfaz
camberasTokenUrl(token, destino): string        // construye el enlace del QR
```

## Formatos aceptados (todos equivalentes)

```
1273f649-65ae-46aa-839a-55c0b58331a0            UUID pelado (pegado a mano)
https://camberas.com/activar.html?t=1273f649-…  dorsales y motos
https://camberas.com/timing?t=1273f649-…        cronometraje
https://camberas.com/a/1273f649-…               forma corta
camberas://activate/1273f649-…                  deep link de la app
exp://192.168.1.10:8081/--/activate/1273f649-…  desarrollo
```

Reglas: se recorta el espacio sobrante, se acepta mayúscula o minúscula y el
token se **normaliza a minúsculas**. Da igual dónde aparezca el UUID (ruta,
query o texto suelto).

## Qué genera cada QR

**Los QR llevan URL, no el UUID pelado.** Si alguien lo escanea con la cámara
del sistema en vez de con la app, llega a una página que le explica qué hacer,
en lugar de a un texto sin sentido.

| Quién | Destino del QR | Dónde se genera |
|---|---|---|
| Corredor | `/activar.html?t=` | herramienta de dorsales / panel |
| Moto | `/activar.html?t=` | Admin → Motos GPS → botón QR |
| Cronometraje | `/timing?t=` | Admin → Puntos de cronometraje → QR |

## Pantalla de seguimiento — un token que no lleva QR

Añadido el 26-ago-2026. Una pantalla encendida seis horas en la carpa es un
**puesto**, igual que un punto de cronometraje: no es una persona con sesión.

| | |
|---|---|
| URL | `/pantalla/<token>` |
| Se genera en | Panel → Seguimiento GPS → Camberas Track (y en Admin → Dorsales GPS) |
| Tabla | `pantallas_seguimiento` |
| RPC públicas | `pantalla_contexto(token)`, `pantalla_sos(token)` |
| RPC de gestión | `generar_token_pantalla`, `pantallas_carrera`, `revocar_token_pantalla` |

**No lleva QR** y es la única del grupo que no lo lleva: no se escanea con un
móvil, se pega en la barra de un navegador. Por eso el panel ofrece copiar el
enlace y abrirlo en ventana nueva, en vez de imprimir un código.

Dos cosas que la distinguen del resto:

- **Ve las alertas SOS CON dorsal y nombre**, al revés que el mapa público
  (ver `20260826180000_sos_quien_ve_que.sql`). Quien mira esa pantalla es quien
  tiene que mandar la ayuda.
- **Late cada minuto** contra `pantalla_contexto`, que sella `last_seen_at`. Es
  lo que permite que el organizador vea desde la mesa si la pantalla de meta
  sigue viva o se ha quedado sin internet.

Se revoca desde el panel (`activa = false`) y deja de funcionar al instante.
Conviene hacerlo al acabar la carrera: mientras el token viva, quien tenga la
URL ve los nombres.

## Preparado para tokens de seguridad (v2)

El resultado de `parseCamberasToken` ya transporta lo que hará falta cuando los
tokens dejen de ser un UUID desnudo:

```ts
{
  token: string,                    // UUID (credencial actual)
  firma?: string,                   // <uuid>.<firma> — token firmado
  params: Record<string,string>,    // v (versión), e (caducidad), s (firma)…
  origen: 'uuid' | 'url' | 'deeplink',
}
```

Hoy `firma` y `params` se ignoran; los lee sin romperse. Cuando se implante la
v2, el cambio es de servidor (validar firma y caducidad en `link_gps_token`) y
del generador del QR — **los lectores ya están preparados**.

Ideas que caben en ese hueco sin tocar los clientes:
- **Caducidad**: `e=<epoch>` para que un QR repartido no valga eternamente.
- **Firma HMAC**: `<uuid>.<hmac>` para que un token no se pueda adivinar ni
  fabricar aunque se filtre el formato.
- **Versión**: `v=2` para convivir con los tokens antiguos durante la transición.

## Recordatorios de operación

- **Regenerar un QR revoca el anterior**: el dispositivo que lo tuviera queda
  huérfano. Los paneles deben casar por token **y** por identificador
  (dorsal/nombre) para sobrevivir a eso — ver `MotoMapViewer`.
- **Transferencia entre dispositivos**: `link_gps_token` devuelve
  `needs_transfer` si el token ya estaba en otro móvil. Los participantes lo
  confirman; en dispositivos de organización (motos) se transfiere directo.
- **Desvincular** libera el token en el servidor (`unlink_gps_token`), no solo
  en el móvil.
