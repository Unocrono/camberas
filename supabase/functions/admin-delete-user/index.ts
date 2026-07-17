import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Get the authorization header to verify the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Falta la cabecera de autorización" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify they are admin
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Token de usuario inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the requesting user is an admin
    const { data: isAdmin, error: roleError } = await supabaseUser.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Solo los administradores pueden eliminar usuarios" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the user ID to delete from the request body
    const { userId, confirm } = await req.json();
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "El userId es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent admin from deleting themselves
    if (userId === user.id) {
      return new Response(
        JSON.stringify({ error: "No puedes eliminar tu propia cuenta" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client to delete the user
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ─── Controles de seguridad antes de borrar ───────────────────────

    // No permitir eliminar al último administrador
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if ((targetRoles ?? []).some((r) => r.role === "admin")) {
      const { count: adminCount } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if ((adminCount ?? 0) <= 1) {
        return new Response(
          JSON.stringify({ error: "No se puede eliminar al último administrador" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Evaluar el impacto: carreras que organiza e inscripciones vinculadas
    const [{ data: ownedRaces }, { count: registrationsCount }] = await Promise.all([
      supabaseAdmin.from("races").select("id, name").eq("organizer_id", userId),
      supabaseAdmin.from("registrations").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const impact = {
      races: (ownedRaces ?? []).map((r) => r.name),
      registrations: registrationsCount ?? 0,
    };

    // Sin confirmación explícita, devolver el impacto para que el panel
    // lo muestre — el borrado NO se ejecuta
    if (confirm !== true) {
      return new Response(
        JSON.stringify({ requiresConfirmation: true, impact }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Las carreras del organizador NO se borran: quedan sin organizador
    // (FK ON DELETE SET NULL) y pueden reasignarse después
    if ((ownedRaces ?? []).length > 0) {
      await supabaseAdmin
        .from("races")
        .update({ organizer_id: null })
        .eq("organizer_id", userId);
    }

    // First delete related data from public tables
    // Delete user_roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    
    // Delete training_plans
    await supabaseAdmin.from("training_plans").delete().eq("user_id", userId);
    
    // Delete chat_messages through conversations
    const { data: conversations } = await supabaseAdmin
      .from("chat_conversations")
      .select("id")
      .eq("user_id", userId);
    
    if (conversations && conversations.length > 0) {
      const conversationIds = conversations.map(c => c.id);
      await supabaseAdmin.from("chat_messages").delete().in("conversation_id", conversationIds);
    }
    
    // Delete chat_conversations
    await supabaseAdmin.from("chat_conversations").delete().eq("user_id", userId);
    
    // Delete profiles
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    // Finally delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return new Response(
        JSON.stringify({ error: "Error al eliminar el usuario" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Usuario eliminado correctamente" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in admin-delete-user:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
