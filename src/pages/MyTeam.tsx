/**
 * Mi equipo — roster persistente del capitán (Equipos v1).
 * El equipo NO está atado a una carrera: el capitán mantiene el roster
 * (miembros con cuenta o anónimos) y lo reutiliza para inscribirse en
 * lote a carreras (y, en el futuro, para salidas de grupetta).
 * CRUD directo contra teams/team_members con RLS; la inscripción en
 * lote y el pago van por edge function (team-register), no por aquí.
 */
import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Users, UserPlus, Trash2, Pencil, ChevronDown, ChevronUp, ShieldCheck, Mail, Flag,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import type { Session } from "@supabase/supabase-js";

interface Team {
  id: string;
  name: string;
  captain_user_id: string;
  created_at: string;
}

interface Member {
  id: string;
  team_id: string;
  user_id: string | null;
  nick: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dni_passport: string | null;
  birth_date: string | null;
  gender: string | null;
}

/** Regla de presentación: nick si existe, si no el nombre de pila */
const nombreVisible = (m: Member) =>
  m.nick?.trim() || m.first_name?.trim() || "(sin nombre)";

const fichaVacia = {
  first_name: "",
  last_name: "",
  nick: "",
  email: "",
  phone: "",
  dni_passport: "",
};

const MyTeam = () => {
  const { toast } = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(false);

  // Auth (mismo patrón que la Zona del Capo: alta instantánea)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombreCapitan, setNombreCapitan] = useState("");

  // Equipos
  const [misEquipos, setMisEquipos] = useState<Team[]>([]);
  const [equiposDondeEstoy, setEquiposDondeEstoy] = useState<Team[]>([]);
  const [nombreEquipo, setNombreEquipo] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  // Roster del equipo abierto
  const [miembros, setMiembros] = useState<Member[]>([]);
  const [cargandoMiembros, setCargandoMiembros] = useState(false);
  const [ficha, setFicha] = useState({ ...fichaVacia });
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Vuelta de Redsys tras pagar un lote (URLOK/URLKO → /equipo?payment=…)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const resultado = searchParams.get("payment");
    if (!resultado) return;
    if (resultado === "success") {
      toast({
        title: "🎉 Pago del equipo completado",
        description: "Inscripciones confirmadas y dorsales asignados. Te llega un email con el resumen.",
      });
    } else {
      toast({
        title: "El pago no se completó",
        description: "No se ha cobrado nada. Puedes reintentarlo desde Inscribir en carrera.",
        variant: "destructive",
      });
    }
    searchParams.delete("payment");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const cargarEquipos = useCallback(async () => {
    if (!session) return;
    // RLS devuelve los equipos que capitaneo y aquellos donde estoy vinculado
    const { data, error } = await (supabase as any)
      .from("teams")
      .select("id, name, captain_user_id, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      toast({ title: "No se pudieron cargar los equipos", description: error.message, variant: "destructive" });
      return;
    }
    const todos = (data ?? []) as Team[];
    setMisEquipos(todos.filter((t) => t.captain_user_id === session.user.id));
    setEquiposDondeEstoy(todos.filter((t) => t.captain_user_id !== session.user.id));
  }, [session, toast]);

  useEffect(() => {
    if (session) cargarEquipos();
    else {
      setMisEquipos([]);
      setEquiposDondeEstoy([]);
      setAbierto(null);
    }
  }, [session, cargarEquipos]);

  const cargarMiembros = useCallback(async (teamId: string) => {
    setCargandoMiembros(true);
    const { data, error } = await (supabase as any)
      .from("team_members")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });
    setCargandoMiembros(false);
    if (error) {
      toast({ title: "No se pudieron cargar los componentes", description: error.message, variant: "destructive" });
      return;
    }
    setMiembros((data ?? []) as Member[]);
  }, [toast]);

  const abrirEquipo = (teamId: string) => {
    const siguiente = abierto === teamId ? null : teamId;
    setAbierto(siguiente);
    setEditando(null);
    setFicha({ ...fichaVacia });
    if (siguiente) cargarMiembros(siguiente);
  };

  const crearEquipo = async () => {
    if (!session) return;
    setCargando(true);
    try {
      const { error } = await (supabase as any).from("teams").insert({
        name: nombreEquipo.trim(),
        captain_user_id: session.user.id,
      });
      if (error) throw error;
      toast({ title: "Equipo creado 🎽", description: "Ya puedes añadir a sus componentes." });
      setNombreEquipo("");
      await cargarEquipos();
    } catch (e: any) {
      toast({ title: "No se pudo crear el equipo", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const borrarEquipo = async (t: Team) => {
    if (!window.confirm(`¿Borrar "${t.name}"?\n\nSe eliminará el equipo y todos sus componentes. Las inscripciones ya hechas NO se tocan.\n\nEsta acción no se puede deshacer.`)) return;
    const { error } = await (supabase as any).from("teams").delete().eq("id", t.id);
    if (error) {
      toast({ title: "No se pudo borrar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Equipo borrado 🗑️" });
    if (abierto === t.id) setAbierto(null);
    await cargarEquipos();
  };

  /** Alta o edición de un miembro. Colisión de nick → sugerencia "Rober2". */
  const guardarMiembro = async () => {
    if (!abierto) return;
    setGuardando(true);
    const datos = {
      first_name: ficha.first_name.trim() || null,
      last_name: ficha.last_name.trim() || null,
      nick: ficha.nick.trim() || null,
      email: ficha.email.trim().toLowerCase() || null,
      phone: ficha.phone.trim() || null,
      dni_passport: ficha.dni_passport.trim() || null,
    };
    try {
      if (!datos.first_name && !datos.nick) {
        throw new Error("Al menos el nombre o el nick");
      }
      const { error } = editando
        ? await (supabase as any).from("team_members").update(datos).eq("id", editando)
        : await (supabase as any).from("team_members").insert({ ...datos, team_id: abierto });
      if (error) {
        if (String(error.message).includes("uq_team_members_nick")) {
          const base = datos.nick ?? "";
          throw new Error(`Ese nick ya está en el equipo. ¿Prueba con "${base}2"?`);
        }
        throw error;
      }
      toast({ title: editando ? "Miembro actualizado ✏️" : "Miembro añadido ✅" });
      setFicha({ ...fichaVacia });
      setEditando(null);
      await cargarMiembros(abierto);
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  const editarMiembro = (m: Member) => {
    setEditando(m.id);
    setFicha({
      first_name: m.first_name ?? "",
      last_name: m.last_name ?? "",
      nick: m.nick ?? "",
      email: m.email ?? "",
      phone: m.phone ?? "",
      dni_passport: m.dni_passport ?? "",
    });
  };

  const borrarMiembro = async (m: Member) => {
    if (!abierto) return;
    if (!window.confirm(`¿Quitar a ${nombreVisible(m)} del equipo?`)) return;
    const { error } = await (supabase as any).from("team_members").delete().eq("id", m.id);
    if (error) {
      toast({ title: "No se pudo quitar", description: error.message, variant: "destructive" });
      return;
    }
    if (editando === m.id) {
      setEditando(null);
      setFicha({ ...fichaVacia });
    }
    await cargarMiembros(abierto);
  };

  const alta = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { first_name: nombreCapitan, last_name: "", is_organizer: false },
          emailRedirectTo: `${window.location.origin}/equipo`,
        },
      });
      if (error) throw error;
      try {
        await supabase.functions.invoke("send-welcome-email", {
          body: { email, firstName: nombreCapitan },
        });
      } catch (emailErr) {
        console.error("Failed to send welcome email:", emailErr);
      }
      toast({
        title: "¡Cuenta creada! 🎽",
        description: "Confirma tu correo si te lo pide y ya puedes crear tu equipo.",
      });
    } catch (e: any) {
      toast({ title: "No se pudo crear la cuenta", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  const login = async () => {
    setCargando(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e: any) {
      toast({ title: "No se pudo iniciar sesión", description: e.message, variant: "destructive" });
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-24 pb-16">
        <div className="container max-w-3xl mx-auto px-4">
          <h1 className="font-archivo text-3xl md:text-4xl uppercase leading-none flex items-center gap-3 mb-2">
            <Users className="h-8 w-8 text-secondary" /> Mi equipo
          </h1>
          <p className="text-muted-foreground mb-8">
            Crea tu equipo una vez y reutilízalo: inscripciones en lote con descuento por
            equipos, y pronto salidas de grupetta con los mismos componentes.
          </p>

          <Card className="border-2 border-secondary/60">
            <CardHeader>
              <CardDescription>
                El capitán mantiene la lista. Los componentes con cuenta de Camberas quedan
                vinculados automáticamente por email o DNI; al resto los gestionas tú.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!session ? (
                <Tabs defaultValue="login">
                  <TabsList className="grid grid-cols-2 w-full">
                    <TabsTrigger value="login">Ya tengo cuenta</TabsTrigger>
                    <TabsTrigger value="alta">Crear cuenta</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login" className="space-y-3 pt-3">
                    <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <Input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Button className="w-full" onClick={login} disabled={cargando || !email || !password}>
                      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "INICIAR SESIÓN"}
                    </Button>
                  </TabsContent>
                  <TabsContent value="alta" className="space-y-3 pt-3">
                    <Input placeholder="Tu nombre" value={nombreCapitan} onChange={(e) => setNombreCapitan(e.target.value)} />
                    <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <Input type="password" placeholder="Contraseña (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={alta}
                      disabled={cargando || !email || !password || !nombreCapitan}
                    >
                      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "🎽 CREAR MI CUENTA"}
                    </Button>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="space-y-6">
                  {/* Crear equipo */}
                  <div className="space-y-3 border rounded-xl p-4">
                    <p className="font-semibold text-sm">✨ Nuevo equipo</p>
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                      <div>
                        <Label>Nombre del equipo</Label>
                        <Input
                          value={nombreEquipo}
                          onChange={(e) => setNombreEquipo(e.target.value)}
                          maxLength={60}
                          placeholder="Ej: CD Camberas Trail"
                        />
                      </div>
                      <Button
                        variant="secondary"
                        onClick={crearEquipo}
                        disabled={cargando || nombreEquipo.trim().length < 3}
                      >
                        {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : "CREAR"}
                      </Button>
                    </div>
                  </div>

                  {/* Mis equipos (capitán) */}
                  {misEquipos.map((t) => (
                    <div key={t.id} className="border rounded-xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="font-archivo uppercase">{t.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Capitán</Badge>
                          <Button size="sm" variant="secondary" asChild>
                            <Link to={`/equipo/inscribir/${t.id}`}>
                              <Flag className="h-4 w-4 mr-1" /> Inscribir en carrera
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => abrirEquipo(t.id)}>
                            {abierto === t.id ? (
                              <>Cerrar <ChevronUp className="h-4 w-4 ml-1" /></>
                            ) : (
                              <>Componentes <ChevronDown className="h-4 w-4 ml-1" /></>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive"
                            onClick={() => borrarEquipo(t)}
                            title="Borrar equipo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {abierto === t.id && (
                        <>
                          {/* Roster */}
                          {cargandoMiembros ? (
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          ) : miembros.length > 0 ? (
                            <ul className="divide-y border rounded-lg">
                              {miembros.map((m) => (
                                <li key={m.id} className="flex items-center gap-2 p-2 text-sm">
                                  <span className="font-medium truncate">{nombreVisible(m)}</span>
                                  {m.first_name && m.nick && (
                                    <span className="text-muted-foreground truncate">
                                      {m.first_name} {m.last_name ?? ""}
                                    </span>
                                  )}
                                  <span className="ml-auto flex items-center gap-1">
                                    {m.user_id ? (
                                      <Badge className="gap-1" variant="default">
                                        <ShieldCheck className="h-3 w-3" /> Vinculado
                                      </Badge>
                                    ) : (
                                      <Badge className="gap-1" variant="outline">
                                        <Mail className="h-3 w-3" /> Anónimo
                                      </Badge>
                                    )}
                                    <Button size="sm" variant="ghost" onClick={() => editarMiembro(m)} title="Editar">
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => borrarMiembro(m)}
                                      title="Quitar del equipo"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">Este equipo aún no tiene componentes.</p>
                          )}

                          {/* Alta / edición de miembro */}
                          <form
                            className="border rounded-lg p-3 space-y-2"
                            onSubmit={(e) => {
                              e.preventDefault();
                              guardarMiembro();
                            }}
                          >
                            <p className="font-semibold text-xs uppercase tracking-wide flex items-center gap-1">
                              <UserPlus className="h-4 w-4" />
                              {editando ? "Editar miembro" : "Añadir miembro"}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Nombre</Label>
                                <Input
                                  value={ficha.first_name}
                                  onChange={(e) => setFicha({ ...ficha, first_name: e.target.value })}
                                  maxLength={60}
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Apellidos</Label>
                                <Input
                                  value={ficha.last_name}
                                  onChange={(e) => setFicha({ ...ficha, last_name: e.target.value })}
                                  maxLength={80}
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Nick (visible en mapas)</Label>
                                <Input
                                  value={ficha.nick}
                                  onChange={(e) => setFicha({ ...ficha, nick: e.target.value })}
                                  maxLength={30}
                                  placeholder="Opcional"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">DNI (vincula su cuenta)</Label>
                                <Input
                                  value={ficha.dni_passport}
                                  onChange={(e) => setFicha({ ...ficha, dni_passport: e.target.value })}
                                  maxLength={20}
                                  placeholder="Opcional"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Email (comunicados)</Label>
                                <Input
                                  type="email"
                                  value={ficha.email}
                                  onChange={(e) => setFicha({ ...ficha, email: e.target.value })}
                                  placeholder="Opcional"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Teléfono</Label>
                                <Input
                                  value={ficha.phone}
                                  onChange={(e) => setFicha({ ...ficha, phone: e.target.value })}
                                  maxLength={20}
                                  placeholder="Opcional"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" type="submit" disabled={guardando}>
                                {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? "Guardar cambios" : "Añadir"}
                              </Button>
                              {editando && (
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setEditando(null);
                                    setFicha({ ...fichaVacia });
                                  }}
                                >
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </form>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Equipos donde estoy (vinculado, no capitán) */}
                  {equiposDondeEstoy.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-semibold text-sm">Equipos en los que estoy</p>
                      {equiposDondeEstoy.map((t) => (
                        <div key={t.id} className="border rounded-xl p-3 flex items-center justify-between">
                          <p className="font-archivo uppercase text-sm">{t.name}</p>
                          <Badge variant="outline">Miembro</Badge>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    className="text-xs text-muted-foreground underline"
                    onClick={() => supabase.auth.signOut()}
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-8">
            ¿Buscas tus inscripciones?{" "}
            <Link to="/profile" className="underline text-foreground">
              Están en tu perfil
            </Link>
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default MyTeam;
