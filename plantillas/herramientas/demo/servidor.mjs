/**
 * Intercepta todo lo que la app le pide a Supabase y lo contesta con los
 * datos simulados de datos.mjs. Así la app de verdad se graba entera sin
 * tocar la base de datos ni necesitar red.
 */
import { TABLAS, RPCS } from './datos.mjs';

export const REF = 'rsahtxjpisnldxnsmupk';

export const USUARIO = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated', role: 'authenticated',
  email: 'organizadordemo@camberas.com',
  user_metadata: { first_name: 'Organizador', last_name: 'Demo' },
  app_metadata: { provider: 'email', providers: ['email'] },
  created_at: new Date().toISOString(),
};

export const SESION = {
  access_token: 'demo', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'demo', user: USUARIO,
};

/** Un solo manejador para todo: si se registran varios, gana el último. */
export async function simular(pagina, { registro } = {}) {
  await pagina.route('**/*.supabase.co/**', async (ruta) => {
    const url = new URL(ruta.request().url());
    const p = url.pathname;
    registro?.(p, url.search);

    if (p.startsWith('/auth/v1'))
      return ruta.fulfill({ json: p.endsWith('/user') ? USUARIO : SESION });

    if (p === '/rest/v1/rpc/has_role') {
      const { _role } = JSON.parse(ruta.request().postData() ?? '{}');
      return ruta.fulfill({ json: _role === 'organizer' });
    }

    if (p.startsWith('/rest/v1/rpc/')) {
      const nombre = p.replace('/rest/v1/rpc/', '');
      return ruta.fulfill({ json: RPCS[nombre] ?? [] });
    }

    const tabla = p.replace('/rest/v1/', '');
    const filas = TABLAS[tabla] ?? [];
    // PostgREST devuelve objeto suelto, no lista, si piden un único registro
    const uno = ruta.request().headers()['accept']?.includes('vnd.pgrst.object');
    return ruta.fulfill({ json: uno ? (filas[0] ?? null) : filas });
  });
}

/** Siembra la sesión antes de que arranque la app. */
export async function sesionSimulada(ctx) {
  await ctx.addInitScript(
    ([ref, s]) => localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s)),
    [REF, SESION]
  );
}
