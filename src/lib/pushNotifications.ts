/**
 * Notificaciones push para Camberas Org: el "clinc" también con la app
 * cerrada. En Android funciona desde el navegador; en iPhone hace falta
 * que la app esté añadida a la pantalla de inicio (iOS 16.4+).
 */

import { supabase } from "@/integrations/supabase/client";

// Clave pública VAPID (no es secreta; la privada vive en los secrets)
const VAPID_PUBLIC_KEY =
  "BO22dRCk2im2m-WG1bsySBf1lC-19HMaA27p6rZwwQ3fy01Kbye2HLZ_2sb8-aXTIndeZX6CzyhsdsVr-7NUqgI";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Pide permiso, se suscribe y guarda la suscripción en la BD.
 * Devuelve un mensaje de error o null si fue bien.
 */
export type ClincMode = "each" | "milestones" | "off";

/**
 * Sincroniza el modo de aviso con el servidor. El push lo decide el
 * servidor, así que el modo tiene que vivir junto a la suscripción y
 * no solo en el localStorage del móvil.
 */
export async function syncPushMode(mode: ClincMode): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await (supabase as any)
      .from("push_subscriptions")
      .update({ clinc_mode: mode })
      .eq("endpoint", sub.endpoint);
  } catch (err) {
    console.error("No se pudo sincronizar el modo de aviso:", err);
  }
}

export async function enablePush(userId: string, mode: ClincMode = "each"): Promise<string | null> {
  if (!isPushSupported()) {
    return "Este navegador no admite notificaciones push";
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return "No has dado permiso para las notificaciones";
  }

  const reg = await navigator.serviceWorker.ready;

  // Si ya existe una suscripción, se reutiliza
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
  }

  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    return "La suscripción no trae las claves necesarias";
  }

  const { error } = await (supabase as any).from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
      clinc_mode: mode,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("Error guardando la suscripción push:", error.message);
    return "No se pudo guardar la suscripción";
  }
  return null;
}

/** Cancela la suscripción en el navegador y la borra de la BD */
export async function disablePush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await (supabase as any).from("push_subscriptions").delete().eq("endpoint", endpoint);
}
