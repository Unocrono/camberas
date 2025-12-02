import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Timer,
  RefreshCw,
  LogOut,
  CheckCircle,
  Clock,
  MapPin,
  User,
  Loader2,
  Wifi,
  WifiOff,
  Ban,
} from "lucide-react";
import { User as SupabaseUser } from "@supabase/supabase-js";

interface Race {
  id: string;
  name: string;
  date: string;
}

interface Checkpoint {
  id: string;
  name: string;
  distance_km: number;
  checkpoint_order: number;
}

interface Runner {
  bib_number: number;
  first_name: string;
  last_name: string;
  event_name: string;
  registration_id: string;
  race_distance_id: string;
}

interface TimingReading {
  id?: string;
  bib_number: number;
  timestamp: string;
  runner_name?: string;
  synced: boolean;
}

const STORAGE_KEY = "timing_session";
const READINGS_KEY = "timing_readings_queue";

const TimingApp = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auth state
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // App state
  const [currentView, setCurrentView] = useState<"login" | "select" | "timing">("login");
  const [races, setRaces] = useState<Race[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);

  // Timing state
  const [bibInput, setBibInput] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [readings, setReadings] = useState<TimingReading[]>([]);
  const [pendingSync, setPendingSync] = useState<TimingReading[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  // Time update
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Load pending readings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(READINGS_KEY);
    if (stored) {
      setPendingSync(JSON.parse(stored));
    }
  }, []);

  // Auth check
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        await checkTimerRole(session.user.id);
      } else {
        // Check stored session
        const storedSession = localStorage.getItem(STORAGE_KEY);
        if (storedSession) {
          const parsed = JSON.parse(storedSession);
          if (parsed.expires_at > Date.now()) {
            setUser({ id: parsed.user_id } as SupabaseUser);
            setIsAuthorized(true);
            if (parsed.race_id && parsed.checkpoint_id) {
              setCurrentView("timing");
              loadStoredContext(parsed);
            } else {
              setCurrentView("select");
            }
          }
        }
      }
      setLoading(false);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
        setTimeout(() => checkTimerRole(session.user.id), 0);
      } else {
        setUser(null);
        setIsAuthorized(false);
        setCurrentView("login");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkTimerRole = async (userId: string) => {
    try {
      // Check if user is timer or organizer
      const { data: hasTimer } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "timer",
      });

      const { data: hasOrganizer } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "organizer",
      });

      const { data: hasAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      if (hasTimer || hasOrganizer || hasAdmin) {
        setIsAuthorized(true);
        setCurrentView("select");
        await fetchRaces(userId, !!hasOrganizer || !!hasAdmin);
      } else {
        toast({
          title: "Acceso denegado",
          description: "No tienes permisos de cronometrador",
          variant: "destructive",
        });
        setIsAuthorized(false);
      }
    } catch (error) {
      console.error("Error checking role:", error);
    }
  };

  const loadStoredContext = async (stored: any) => {
    // Load race and checkpoint from storage
    try {
      const { data: race } = await supabase
        .from("races")
        .select("id, name, date")
        .eq("id", stored.race_id)
        .single();

      if (race) {
        setSelectedRace(race);
        await fetchCheckpoints(race.id);
        await fetchRunners(race.id);

        if (stored.checkpoint_id) {
          const { data: checkpoint } = await supabase
            .from("race_checkpoints")
            .select("id, name, distance_km, checkpoint_order")
            .eq("id", stored.checkpoint_id)
            .single();

          if (checkpoint) {
            setSelectedCheckpoint(checkpoint);
          }
        }
      }
    } catch (error) {
      console.error("Error loading stored context:", error);
    }
  };

  const fetchRaces = async (userId: string, isOrganizerOrAdmin: boolean) => {
    try {
      let query = supabase.from("races").select("id, name, date");

      if (!isOrganizerOrAdmin) {
        // Timer: only assigned races
        const { data: assignments } = await supabase
          .from("timer_assignments")
          .select("race_id")
          .eq("user_id", userId);

        if (assignments && assignments.length > 0) {
          const raceIds = assignments.map((a) => a.race_id);
          query = query.in("id", raceIds);
        } else {
          setRaces([]);
          return;
        }
      }

      const { data, error } = await query.order("date", { ascending: false });
      if (error) throw error;
      setRaces(data || []);
    } catch (error: any) {
      console.error("Error fetching races:", error);
    }
  };

  const fetchCheckpoints = async (raceId: string) => {
    try {
      const { data, error } = await supabase
        .from("race_checkpoints")
        .select("id, name, distance_km, checkpoint_order")
        .eq("race_id", raceId)
        .order("checkpoint_order", { ascending: true });

      if (error) throw error;
      setCheckpoints(data || []);
    } catch (error: any) {
      console.error("Error fetching checkpoints:", error);
    }
  };

  const fetchRunners = async (raceId: string) => {
    try {
      const { data, error } = await supabase
        .from("registrations")
        .select(`
          id,
          bib_number,
          race_distance_id,
          guest_first_name,
          guest_last_name,
          user_id,
          race_distances!inner(name)
        `)
        .eq("race_id", raceId)
        .eq("status", "confirmed")
        .not("bib_number", "is", null);

      if (error) throw error;

      // Fetch profiles for registered users
      const runnersData: Runner[] = await Promise.all(
        (data || []).map(async (reg: any) => {
          let firstName = reg.guest_first_name;
          let lastName = reg.guest_last_name;

          if (reg.user_id && !firstName) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("first_name, last_name")
              .eq("id", reg.user_id)
              .single();

            if (profile) {
              firstName = profile.first_name;
              lastName = profile.last_name;
            }
          }

          return {
            bib_number: reg.bib_number,
            first_name: firstName || "",
            last_name: lastName || "",
            event_name: reg.race_distances?.name || "",
            registration_id: reg.id,
            race_distance_id: reg.race_distance_id,
          };
        })
      );

      setRunners(runnersData);
      // Store in localStorage for offline
      localStorage.setItem(`runners_${raceId}`, JSON.stringify(runnersData));
    } catch (error: any) {
      console.error("Error fetching runners:", error);
      // Try to load from localStorage
      const stored = localStorage.getItem(`runners_${raceId}`);
      if (stored) {
        setRunners(JSON.parse(stored));
      }
    }
  };

  const handleSelectRace = async (raceId: string) => {
    const race = races.find((r) => r.id === raceId);
    if (race) {
      setSelectedRace(race);
      await fetchCheckpoints(raceId);
      await fetchRunners(raceId);
    }
  };

  const handleSelectCheckpoint = (checkpointId: string) => {
    const checkpoint = checkpoints.find((c) => c.id === checkpointId);
    if (checkpoint) {
      setSelectedCheckpoint(checkpoint);
    }
  };

  const handleStartTiming = () => {
    if (!selectedRace || !selectedCheckpoint) {
      toast({
        title: "Selección incompleta",
        description: "Selecciona carrera y checkpoint",
        variant: "destructive",
      });
      return;
    }

    // Save session to localStorage (5 days)
    const sessionData = {
      user_id: user?.id,
      race_id: selectedRace.id,
      checkpoint_id: selectedCheckpoint.id,
      logged_at: Date.now(),
      expires_at: Date.now() + 5 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));

    setCurrentView("timing");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleRecordTime = async () => {
    const bib = parseInt(bibInput);
    if (isNaN(bib) || bib <= 0) {
      toast({
        title: "Dorsal inválido",
        description: "Introduce un número de dorsal válido",
        variant: "destructive",
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const runner = runners.find((r) => r.bib_number === bib);

    const reading: TimingReading = {
      bib_number: bib,
      timestamp,
      runner_name: runner ? `${runner.first_name} ${runner.last_name}`.trim() : undefined,
      synced: false,
    };

    // Add to readings list (most recent first)
    setReadings((prev) => [reading, ...prev].slice(0, 50));
    setBibInput("");
    inputRef.current?.focus();

    // Try to sync immediately if online
    if (isOnline && selectedRace && selectedCheckpoint) {
      try {
        const { error } = await supabase.from("timing_readings").insert({
          race_id: selectedRace.id,
          checkpoint_id: selectedCheckpoint.id,
          bib_number: bib,
          timing_timestamp: timestamp,
          reading_timestamp: timestamp,
          reading_type: "manual",
          operator_user_id: user?.id,
          registration_id: runner?.registration_id || null,
          race_distance_id: runner?.race_distance_id || null,
        });

        if (error) throw error;

        // Mark as synced
        setReadings((prev) =>
          prev.map((r, i) => (i === 0 ? { ...r, synced: true } : r))
        );

        toast({
          title: `#${bib} registrado`,
          description: runner ? `${runner.first_name} ${runner.last_name}` : "Dorsal no encontrado en lista",
        });
      } catch (error) {
        console.error("Error syncing reading:", error);
        // Add to pending queue
        const newPending = [...pendingSync, reading];
        setPendingSync(newPending);
        localStorage.setItem(READINGS_KEY, JSON.stringify(newPending));
      }
    } else {
      // Offline: add to pending queue
      const newPending = [...pendingSync, reading];
      setPendingSync(newPending);
      localStorage.setItem(READINGS_KEY, JSON.stringify(newPending));

      toast({
        title: `#${bib} guardado (offline)`,
        description: "Se sincronizará cuando haya conexión",
      });
    }
  };

  const handleSync = async () => {
    if (!isOnline || pendingSync.length === 0 || !selectedRace || !selectedCheckpoint) return;

    setSyncing(true);
    try {
      const toInsert = pendingSync.map((reading) => {
        const runner = runners.find((r) => r.bib_number === reading.bib_number);
        return {
          race_id: selectedRace.id,
          checkpoint_id: selectedCheckpoint.id,
          bib_number: reading.bib_number,
          timing_timestamp: reading.timestamp,
          reading_timestamp: reading.timestamp,
          reading_type: "manual",
          operator_user_id: user?.id,
          registration_id: runner?.registration_id || null,
          race_distance_id: runner?.race_distance_id || null,
        };
      });

      const { error } = await supabase.from("timing_readings").insert(toInsert);

      if (error) throw error;

      // Clear pending queue
      setPendingSync([]);
      localStorage.removeItem(READINGS_KEY);

      // Mark all readings as synced
      setReadings((prev) => prev.map((r) => ({ ...r, synced: true })));

      toast({
        title: "Sincronizado",
        description: `${toInsert.length} lecturas sincronizadas`,
      });
    } catch (error: any) {
      toast({
        title: "Error de sincronización",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleLogout = async () => {
    if (pendingSync.length > 0) {
      const confirm = window.confirm(
        `Tienes ${pendingSync.length} lecturas sin sincronizar. ¿Deseas cerrar sesión igualmente?`
      );
      if (!confirm) return;
    }

    localStorage.removeItem(STORAGE_KEY);
    await supabase.auth.signOut();
    setCurrentView("login");
    setSelectedRace(null);
    setSelectedCheckpoint(null);
    setReadings([]);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
    } catch (error: any) {
      toast({
        title: "Error de login",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoginLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Login view
  if (currentView === "login" || !isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-14 border-b border-border flex items-center justify-center bg-card">
          <div className="flex items-center gap-2">
            <Timer className="h-6 w-6 text-primary" />
            <span className="font-bold text-lg">Camberas Timing</span>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
              <CardTitle>Acceso Cronometradores</CardTitle>
              <CardDescription>
                Inicia sesión con tu cuenta de cronometrador
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loginLoading}>
                  {loginLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Timer className="h-4 w-4 mr-2" />
                  )}
                  Entrar
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Selection view
  if (currentView === "select") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-2">
            <Timer className="h-6 w-6 text-primary" />
            <span className="font-bold">Timing</span>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </header>

        <main className="flex-1 p-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Seleccionar Carrera</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Carrera</Label>
                <Select
                  value={selectedRace?.id || ""}
                  onValueChange={handleSelectRace}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una carrera" />
                  </SelectTrigger>
                  <SelectContent>
                    {races.map((race) => (
                      <SelectItem key={race.id} value={race.id}>
                        {race.name} ({new Date(race.date).toLocaleDateString("es-ES")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRace && checkpoints.length > 0 && (
                <div className="space-y-2">
                  <Label>Punto de Control</Label>
                  <Select
                    value={selectedCheckpoint?.id || ""}
                    onValueChange={handleSelectCheckpoint}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona checkpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      {checkpoints.map((cp) => (
                        <SelectItem key={cp.id} value={cp.id}>
                          {cp.name} (KM {cp.distance_km})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedRace && selectedCheckpoint && (
                <div className="pt-4">
                  <div className="bg-muted/50 rounded-lg p-3 mb-4">
                    <p className="text-sm text-muted-foreground">Corredores cargados:</p>
                    <p className="font-bold text-lg">{runners.length}</p>
                  </div>
                  <Button onClick={handleStartTiming} className="w-full" size="lg">
                    <Timer className="h-5 w-5 mr-2" />
                    Comenzar Cronometraje
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Timing view
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-card sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <div className="text-sm">
            <span className="font-bold">{selectedCheckpoint?.name}</span>
            <span className="text-muted-foreground ml-1 hidden sm:inline">
              - {selectedRace?.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-500" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-500" />
          )}
          {pendingSync.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pendingSync.length} pendientes
            </Badge>
          )}
        </div>
      </header>

      {/* Readings list */}
      <div className="flex-1 overflow-auto p-4 pb-48">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">
          ÚLTIMOS REGISTROS
        </h3>
        {readings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Sin registros aún</p>
          </div>
        ) : (
          <div className="space-y-2">
            {readings.map((reading, index) => (
              <div
                key={`${reading.bib_number}-${reading.timestamp}`}
                className="flex items-center justify-between bg-card border border-border rounded-lg p-3"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-lg">
                    #{reading.bib_number}
                  </Badge>
                  <div>
                    <p className="font-medium">
                      {reading.runner_name || "Dorsal no registrado"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(reading.timestamp).toLocaleTimeString("es-ES")}
                    </p>
                  </div>
                </div>
                {reading.synced ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <Clock className="h-5 w-5 text-yellow-500" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area (fixed at bottom) */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 space-y-3">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Dorsal"
            value={bibInput}
            onChange={(e) => setBibInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRecordTime()}
            className="text-2xl font-mono h-14 text-center"
            autoFocus
          />
        </div>
        <Button
          onClick={handleRecordTime}
          className="w-full h-16 text-xl"
          size="lg"
        >
          <Clock className="h-6 w-6 mr-2" />
          {formatTime(currentTime)}
        </Button>

        {/* Bottom actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleSync}
            disabled={!isOnline || pendingSync.length === 0 || syncing}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sincronizar
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentView("select")}
          >
            <MapPin className="h-4 w-4 mr-2" />
            Cambiar
          </Button>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default TimingApp;
