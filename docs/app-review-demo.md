# QR de demostración para App Review (Apple)

Apple rechazó la 1.0 (20) de camberas-track con la Guideline 2.1(a): necesitan
un QR de demostración para evaluar las funciones de la app (submission
`8798cfb4-796e-4793-94a3-cafb19966e17`).

## Qué hay preparado

| Pieza | Dónde |
|---|---|
| Token demo fijo | `8e2532de-1646-4140-8bf8-38a3d046fa83` (dorsal 999, «Demo App Review») |
| Seed que lo crea en producción | `supabase/seeds/demo_app_review.sql` |
| Imagen QR (512 px) | `public/demo-review-qr.png` |
| Página para el revisor | `https://camberas.com/demo-review.html` |

El QR codifica `https://camberas.com/activar.html?t=<token>` — el mismo formato
que los QR reales de dorsal (`docs/tokens-camberas.md`), así que el lector de la
app lo acepta tal cual y la cámara del sistema lleva a la página de activación.

El token **no pertenece a ninguna carrera** (`event_id NULL`): la vinculación,
el tracking y el SOS funcionan completos, pero sus posiciones jamás salen en el
mapa público de una carrera real. Si varios revisores lo escanean, la app pide
confirmar la transferencia de dispositivo (`needs_transfer`), que es el
comportamiento normal.

## Pasos para responder a Apple

1. **Ejecutar el seed en producción**: copiar
   `supabase/seeds/demo_app_review.sql` en el SQL editor de Supabase. Es
   idempotente: si el token ya existe lo reactiva y lo desvincula.
2. **Desplegar la web** (para que existan `/demo-review.html` y
   `/demo-review-qr.png`).
3. **Probar una vez**: escanear el QR desde la app propia y comprobar que
   vincula el dorsal 999.
4. **En App Store Connect** → la app → versión 1.0 → *App Review Information* →
   *Notes*, pegar el texto de abajo y guardar. Responder también al mensaje de
   App Review con el mismo texto.

### Texto para las Notes (en inglés)

```
Demo QR code for review:

Please open this page on any second screen (computer or another phone):
https://camberas.com/demo-review.html

It shows a demo QR code. In the Camberas Track app, tap "Scan QR" and scan
it. The app will link demo bib number 999 and every feature becomes
available: live GPS tracking, the SOS button, and unlinking.

The QR encodes this activation link, which can also be opened directly on
the review device instead of scanning:
https://camberas.com/activar.html?t=8e2532de-1646-4140-8bf8-38a3d046fa83

The demo bib is permanently active for review purposes and is not attached
to any real race. If the app reports the bib is linked to another device,
tap "Transfer" — that is the expected flow when a bib moves to a new phone.
```

## Después de la revisión

El token puede quedarse activo (no da acceso a nada real) o revocarse con el
`UPDATE` comentado al final del seed. Si se revoca, volver a ejecutar el seed
lo reactiva para la siguiente revisión.
