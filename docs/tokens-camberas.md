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
