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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Falta la cabecera de autorización" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the requesting user is an admin
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

    const { data: isAdmin, error: roleError } = await supabaseUser.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError || !isAdmin) {
      return new Response(
        JSON.stringify({ error: "Solo los administradores pueden actualizar usuarios" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { userId, email, password, firstName, lastName, phone, role, roles } = await req.json();
    
    // Support both single role (legacy) and multiple roles
    const userRoles: string[] | null = roles || (role ? [role] : null);
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "El userId es obligatorio" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Update auth user if email or password changed
    const authUpdates: any = {};
    if (email) authUpdates.email = email;
    if (password) authUpdates.password = password;

    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        authUpdates
      );

      if (authUpdateError) {
        console.error("Error updating auth user:", authUpdateError);
        // Translate common errors
        let errorMessage = authUpdateError.message;
        if (errorMessage.includes("already exists") || errorMessage.includes("already registered")) {
          errorMessage = "Ya existe un usuario con este email";
        }
        return new Response(
          JSON.stringify({ error: errorMessage }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update profile
    const profileUpdates: any = {};
    if (firstName !== undefined) profileUpdates.first_name = firstName;
    if (lastName !== undefined) profileUpdates.last_name = lastName;
    if (phone !== undefined) profileUpdates.phone = phone;

    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdates)
        .eq("id", userId);

      if (profileError) {
        console.error("Error updating profile:", profileError);
        return new Response(
          JSON.stringify({ error: "Error al actualizar el perfil" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Update roles if provided
    if (userRoles && userRoles.length > 0) {
      // Delete existing roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      
      // Insert all roles
      for (const r of userRoles) {
        await supabaseAdmin.from("user_roles").insert({
          user_id: userId,
          role: r,
          status: r === "organizer" ? "approved" : null,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Usuario actualizado correctamente" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in admin-update-user:", error);
    const errorMessage = error instanceof Error ? error.message : "Error desconocido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
