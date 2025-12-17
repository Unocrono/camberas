import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { User as SupabaseUser } from "@supabase/supabase-js";
import { Pencil, Trash2 } from "lucide-react";

interface Race {
  id: string;
  name: string;
  date: string;
}

interface TimingPoint {
  id: string;
  name: string;
  notes: string | null;
  point_order: number | null;
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
  status_code?: string;
  notes?: string;
}

type StatusCode = "ABANDONO" | "NO_SALE" | "DESCALIFICADO" | "EN_CARRERA";

const STATUS_OPTIONS: { value: StatusCode; label: string; description: string; icon: React.ReactNode }[] = [
  { value: "ABANDONO", label: "ABANDONO", description: "Abandonó durante la carrera", icon: <XCircle className="h-4 w-4" /> },
  { value: "NO_SALE", label: "NO SALE", description: "No comenzó la carrera", icon: <Ban className="h-4 w-4" /> },
  { value: "DESCALIFICADO", label: "DESCALIFICADO", description: "Descalificado por infracción", icon: <AlertTriangle className="h-4 w-4" /> },
  { value: "EN_CARRERA", label: "EN CARRERA", description: "Continúa en carrera", icon: <User className="h-4 w-4" /> },
];

const STORAGE_KEY = "timing_session";
const READINGS_KEY = "timing_readings_queue";
const ABANDONS_KEY = "timing_abandons_queue";

interface PendingAbandon {
  bib_number: number;
  abandon_type: StatusCode;
  reason: string;
  timing_point_id: string | null;
  registration_id: string;
  race_distance_id: string;
  runner_name: string;
  timestamp: string;
}

const TimingApp = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auth state
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isOrganizerOrAdmin, setIsOrganizerOrAdmin] = useState(false);

  // App state
  const [currentView, setCurrentView] = useState<"login" | "select" | "timing">("login");
  const [races, setRaces] = useState<Race[]>([]);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [selectedRace, setSelectedRace] = useState<Race | null>(null);
  const [selectedTimingPoint, setSelectedTimingPoint] = useState<TimingPoint | null>(null);
  const [userAssignments, setUserAssignments] = useState<{ race_id: string; checkpoint_id: string | null }[]>([]);

  // Timing state
  const [bibInput, setBibInput] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());
  const [readings, setReadings] = useState<TimingReading[]>([]);
  const [pendingSync, setPendingSync] = useState<TimingReading[]>([]);
  const [pendingAbandons, setPendingAbandons] = useState<PendingAbandon[]>([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<"timing" | "status">("timing");

  // Status form state
  const [statusBibInput, setStatusBibInput] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<StatusCode | "">("");
  const [statusNotes, setStatusNotes] = useState("");
  const [statusRunnerInfo, setStatusRunnerInfo] = useState<Runner | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  // Race start time for calculating race time
  const [raceStartTime, setRaceStartTime] = useState<Date | null>(null);

  // Edit reading state
  const [editingReading, setEditingReading] = useState<TimingReading | null>(null);
  const [editBibInput, setEditBibInput] = useState("");
  const [editTimeInput, setEditTimeInput] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Registered abandons state
  interface RegisteredAbandon {
    id: string;
    bib_number: number;
    abandon_type: string;
    reason: string;
    timing_point_id: string | null;
    created_at: string;
    runner_name?: string;
  }
  const [registeredAbandons, setRegisteredAbandons] = useState<RegisteredAbandon[]>([]);
  const [loadingAbandons, setLoadingAbandons] = useState(false);
  const [editingAbandon, setEditingAbandon] = useState<RegisteredAbandon | null>(null);
  const [isEditAbandonDialogOpen, setIsEditAbandonDialogOpen] = useState(false);
  const [editAbandonType, setEditAbandonType] = useState<StatusCode | "">("");
  const [editAbandonReason, setEditAbandonReason] = useState("");
  const [savingAbandon, setSavingAbandon] = useState(false);

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

  // Load pending readings and abandons from localStorage
  useEffect(() => {
    const storedReadings = localStorage.getItem(READINGS_KEY);
    if (storedReadings) {
      setPendingSync(JSON.parse(storedReadings));
    }
    const storedAbandons = localStorage.getItem(ABANDONS_KEY);
    if (storedAbandons) {
      setPendingAbandons(JSON.parse(storedAbandons));
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

      const isOrgOrAdmin = !!hasOrganizer || !!hasAdmin;
      setIsOrganizerOrAdmin(isOrgOrAdmin);

      if (hasTimer || hasOrganizer || hasAdmin) {
        setIsAuthorized(true);
        setCurrentView("select");
        
        // Fetch assignments for timers
        let assignments: { race_id: string; checkpoint_id: string | null }[] = [];
        if (!isOrgOrAdmin) {
          const { data: assignmentsData } = await supabase
            .from("timer_assignments")
            .select("race_id, checkpoint_id")
            .eq("user_id", userId);
          assignments = assignmentsData || [];
          setUserAssignments(assignments);
        }
        
        // Pass assignments directly to fetchRaces to avoid state timing issues
        await fetchRaces(userId, isOrgOrAdmin, assignments);
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
    // Load race and timing point from storage
    try {
      // First load user's assignments if they're a timer
      const { data: hasTimer } = await supabase.rpc("has_role", {
        _user_id: stored.user_id,
        _role: "timer",
      });
      const { data: hasOrganizer } = await supabase.rpc("has_role", {
        _user_id: stored.user_id,
        _role: "organizer",
      });
      const { data: hasAdmin } = await supabase.rpc("has_role", {
        _user_id: stored.user_id,
        _role: "admin",
      });
      
      const isOrgOrAdmin = !!hasOrganizer || !!hasAdmin;
      setIsOrganizerOrAdmin(isOrgOrAdmin);
      
      let assignments: { race_id: string; checkpoint_id: string | null }[] = [];
      if (!isOrgOrAdmin) {
        const { data: assignmentsData } = await supabase
          .from("timer_assignments")
          .select("race_id, checkpoint_id")
          .eq("user_id", stored.user_id);
        assignments = assignmentsData || [];
        setUserAssignments(assignments);
      }

      const { data: race } = await supabase
        .from("races")
        .select("id, name, date")
        .eq("id", stored.race_id)
        .single();

      if (race) {
        setSelectedRace(race);
        // Pass assignments directly to avoid state timing issues
        await fetchTimingPoints(race.id, stored.user_id, isOrgOrAdmin, assignments);
        await fetchRunners(race.id);
        await fetchRaceStartTime(race.id, race.date);

        if (stored.timing_point_id) {
          const { data: timingPoint } = await supabase
            .from("timing_points")
            .select("id, name, notes, point_order")
            .eq("id", stored.timing_point_id)
            .single();

          if (timingPoint) {
            setSelectedTimingPoint(timingPoint);
          }
        }
      }
    } catch (error) {
      console.error("Error loading stored context:", error);
    }
  };

  const fetchRaces = async (userId: string, isOrgOrAdmin: boolean, assignments?: { race_id: string; checkpoint_id: string | null }[]) => {
    try {
      let query = supabase.from("races").select("id, name, date");

      if (isOrgOrAdmin) {
        // Organizer: only their own races, Admin: all races
        const { data: hasAdmin } = await supabase.rpc("has_role", {
          _user_id: userId,
          _role: "admin",
        });
        
        if (!hasAdmin) {
          // Organizer - only their races
          query = query.eq("organizer_id", userId);
        }
      } else {
        // Timer: only assigned races - use passed assignments
        const timerAssignments = assignments || userAssignments;
        if (timerAssignments.length > 0) {
          const raceIds = [...new Set(timerAssignments.map((a) => a.race_id))];
          query = query.in("id", raceIds);
        } else {
          setRaces([]);
          return;
        }
      }

      const { data, error } = await query.order("date", { ascending: false });
      if (error) throw error;
      
      const fetchedRaces = data || [];
      setRaces(fetchedRaces);
      
      // Auto-select if only one race
      if (fetchedRaces.length === 1) {
        setSelectedRace(fetchedRaces[0]);
        await fetchTimingPoints(fetchedRaces[0].id, userId, isOrgOrAdmin, assignments);
        await fetchRunners(fetchedRaces[0].id);
        await fetchRaceStartTime(fetchedRaces[0].id, fetchedRaces[0].date);
      }
    } catch (error: any) {
      console.error("Error fetching races:", error);
    }
  };

  const fetchTimingPoints = async (raceId: string, userId?: string, isOrgOrAdmin?: boolean, assignments?: { race_id: string; checkpoint_id: string | null }[]) => {
    try {
      let query = supabase
        .from("timing_points")
        .select("id, name, notes, point_order")
        .eq("race_id", raceId)
        .order("point_order", { ascending: true, nullsFirst: false });

      const { data, error } = await query;
      if (error) throw error;
      
      let filteredPoints = data || [];
      
      // Filter by assignments if user is timer (not organizer/admin)
      const checkIsOrgOrAdmin = isOrgOrAdmin !== undefined ? isOrgOrAdmin : isOrganizerOrAdmin;
      const checkUserId = userId || user?.id;
      
      if (!checkIsOrgOrAdmin && checkUserId) {
        // Use passed assignments or fall back to state
        const timerAssignments = assignments || userAssignments;
        
        // Get user's assignments for this race
        const raceAssignments = timerAssignments.filter(a => a.race_id === raceId);
        
        // If user has specific checkpoint assignments, filter to those
        const assignedCheckpointIds = raceAssignments
          .filter(a => a.checkpoint_id !== null)
          .map(a => a.checkpoint_id);
        
        if (assignedCheckpointIds.length > 0) {
          filteredPoints = filteredPoints.filter(tp => assignedCheckpointIds.includes(tp.id));
        }
        // If no specific checkpoints assigned (only race), show all timing points
      }
      
      setTimingPoints(filteredPoints);
      
      // Auto-select if only one timing point
      if (filteredPoints.length === 1) {
        setSelectedTimingPoint(filteredPoints[0]);
      }
    } catch (error: any) {
      console.error("Error fetching timing points:", error);
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
        .in("status", ["confirmed", "pending"])
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

  // Fetch race start time from wave (source of truth)
  const fetchRaceStartTime = async (raceId: string, _raceDate: string) => {
    try {
      // Get start_time from race_waves (earliest wave as reference)
      const { data: waves, error } = await supabase
        .from("race_waves")
        .select("start_time")
        .eq("race_id", raceId)
        .not("start_time", "is", null)
        .order("start_time", { ascending: true })
        .limit(1);

      if (error) throw error;

      if (waves && waves.length > 0 && waves[0].start_time) {
        // race_waves.start_time is already a full timestamp with timezone
        const startDate = new Date(waves[0].start_time);
        setRaceStartTime(startDate);
        localStorage.setItem(`start_time_${raceId}`, startDate.toISOString());
      }
    } catch (error) {
      console.error("Error fetching race start time:", error);
      // Try from localStorage
      const stored = localStorage.getItem(`start_time_${raceId}`);
      if (stored) {
        setRaceStartTime(new Date(stored));
      }
    }
  };

  // Calculate race time (reading time - start time)
  const calculateRaceTime = (readingTimestamp: string): string | null => {
    if (!raceStartTime) return null;
    
    const readingTime = new Date(readingTimestamp);
    const diffMs = readingTime.getTime() - raceStartTime.getTime();
    
    if (diffMs < 0) return null;
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  // Fetch registered abandons for this race
  const fetchAbandons = useCallback(async (raceId: string) => {
    if (!isOnline) return;
    setLoadingAbandons(true);
    try {
      const { data, error } = await supabase
        .from("race_results_abandons")
        .select("id, bib_number, abandon_type, reason, timing_point_id, created_at, registration_id")
        .eq("race_id", raceId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const abandonsWithNames = (data || []).map((abandon: any) => {
        const runner = runners.find(r => r.bib_number === abandon.bib_number);
        return {
          ...abandon,
          runner_name: runner ? `${runner.first_name} ${runner.last_name}`.trim() : undefined,
        };
      });

      setRegisteredAbandons(abandonsWithNames);
    } catch (error) {
      console.error("Error fetching abandons:", error);
    } finally {
      setLoadingAbandons(false);
    }
  }, [runners, isOnline]);

  // Fetch existing readings from database for the selected timing point
  const fetchExistingReadings = useCallback(async (raceId: string, timingPointId: string | null) => {
    if (!isOnline) return;
    
    try {
      let query = supabase
        .from("timing_readings")
        .select("id, bib_number, timing_timestamp, status_code, notes, synced:is_processed")
        .eq("race_id", raceId)
        .order("timing_timestamp", { ascending: false })
        .limit(100);
      
      // Filter by timing point if selected
      if (timingPointId) {
        query = query.eq("timing_point_id", timingPointId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Map to TimingReading format and merge with runner info
      const dbReadings: TimingReading[] = (data || []).map((r: any) => {
        const runner = runners.find((run) => run.bib_number === r.bib_number);
        return {
          id: r.id,
          bib_number: r.bib_number,
          timestamp: r.timing_timestamp,
          runner_name: runner ? `${runner.first_name} ${runner.last_name}`.trim() : undefined,
          synced: true,
          status_code: r.status_code || undefined,
          notes: r.notes || undefined,
        };
      });

      setReadings(dbReadings);
    } catch (error) {
      console.error("Error fetching existing readings:", error);
    }
  }, [isOnline, runners]);

  // Fetch abandons when race is selected and runners are loaded
  useEffect(() => {
    if (selectedRace && runners.length > 0 && currentView === "timing") {
      fetchAbandons(selectedRace.id);
    }
  }, [selectedRace, runners, currentView, fetchAbandons]);

  // Fetch existing readings when timing view is active and timing point is selected
  useEffect(() => {
    if (selectedRace && selectedTimingPoint && runners.length > 0 && currentView === "timing") {
      fetchExistingReadings(selectedRace.id, selectedTimingPoint.id);
    }
  }, [selectedRace, selectedTimingPoint, runners, currentView, fetchExistingReadings]);

  // Edit abandon handlers
  const handleOpenEditAbandon = (abandon: RegisteredAbandon) => {
    setEditingAbandon(abandon);
    setEditAbandonType(abandon.abandon_type as StatusCode);
    setEditAbandonReason(abandon.reason);
    setIsEditAbandonDialogOpen(true);
  };

  const handleSaveAbandon = async () => {
    if (!editingAbandon || !editAbandonType || editAbandonReason.length < 10) return;
    
    setSavingAbandon(true);
    try {
      const { error } = await supabase
        .from("race_results_abandons")
        .update({
          abandon_type: editAbandonType,
          reason: editAbandonReason,
        })
        .eq("id", editingAbandon.id);

      if (error) throw error;

      toast({
        title: "Actualizado",
        description: "Registro de retirado actualizado correctamente",
      });

      // Refresh list
      if (selectedRace) fetchAbandons(selectedRace.id);
      setIsEditAbandonDialogOpen(false);
      setEditingAbandon(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo actualizar",
        variant: "destructive",
      });
    } finally {
      setSavingAbandon(false);
    }
  };

  const handleDeleteAbandon = async (abandonId: string) => {
    if (!window.confirm("¿Estás seguro de eliminar este registro?")) return;

    try {
      const { error } = await supabase
        .from("race_results_abandons")
        .delete()
        .eq("id", abandonId);

      if (error) throw error;

      toast({
        title: "Eliminado",
        description: "Registro de retirado eliminado",
      });

      // Refresh list
      if (selectedRace) fetchAbandons(selectedRace.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar",
        variant: "destructive",
      });
    }
  };

  const handleSelectRace = async (raceId: string) => {
    const race = races.find((r) => r.id === raceId);
    if (race) {
      setSelectedRace(race);
      setSelectedTimingPoint(null); // Reset timing point selection
      // Pass userAssignments directly to ensure filtering works correctly
      await fetchTimingPoints(raceId, user?.id, isOrganizerOrAdmin, userAssignments);
      await fetchRunners(raceId);
      await fetchRaceStartTime(raceId, race.date);
    }
  };

  const handleSelectTimingPoint = (timingPointId: string) => {
    const timingPoint = timingPoints.find((tp) => tp.id === timingPointId);
    if (timingPoint) {
      setSelectedTimingPoint(timingPoint);
    }
  };

  const handleStartTiming = async () => {
    if (!selectedRace || !selectedTimingPoint) {
      toast({
        title: "Selección incompleta",
        description: "Selecciona carrera y punto de cronometraje",
        variant: "destructive",
      });
      return;
    }

    // Save session to localStorage (5 days)
    const sessionData = {
      user_id: user?.id,
      race_id: selectedRace.id,
      timing_point_id: selectedTimingPoint.id,
      logged_at: Date.now(),
      expires_at: Date.now() + 5 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));

    // Fetch existing readings for this timing point
    await fetchExistingReadings(selectedRace.id, selectedTimingPoint.id);

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
    if (isOnline && selectedRace && selectedTimingPoint) {
      try {
        const { error } = await supabase.from("timing_readings").insert({
          race_id: selectedRace.id,
          timing_point_id: selectedTimingPoint.id,
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
    if (!isOnline || !selectedRace) return;
    if (pendingSync.length === 0 && pendingAbandons.length === 0) return;

    setSyncing(true);
    let syncedReadings = 0;
    let syncedAbandons = 0;

    try {
      // Sync timing readings
      if (pendingSync.length > 0) {
        const toInsert = pendingSync.map((reading) => {
          const runner = runners.find((r) => r.bib_number === reading.bib_number);
          return {
            race_id: selectedRace.id,
            timing_point_id: selectedTimingPoint?.id || null,
            bib_number: reading.bib_number,
            timing_timestamp: reading.timestamp,
            reading_timestamp: reading.timestamp,
            reading_type: reading.status_code ? "status_change" : "manual",
            status_code: reading.status_code || null,
            notes: reading.notes || null,
            operator_user_id: user?.id,
            registration_id: runner?.registration_id || null,
            race_distance_id: runner?.race_distance_id || null,
          };
        });

        const { error } = await supabase.from("timing_readings").insert(toInsert);
        if (error) throw error;

        syncedReadings = toInsert.length;
        setPendingSync([]);
        localStorage.removeItem(READINGS_KEY);
      }

      // Sync abandons
      if (pendingAbandons.length > 0) {
        const abandonsToInsert = pendingAbandons.map((abandon) => ({
          race_id: selectedRace.id,
          registration_id: abandon.registration_id,
          race_distance_id: abandon.race_distance_id,
          bib_number: abandon.bib_number,
          abandon_type: abandon.abandon_type,
          timing_point_id: abandon.timing_point_id,
          reason: abandon.reason,
          operator_user_id: user?.id || null,
        }));

        const { error } = await supabase.from("race_results_abandons").insert(abandonsToInsert);
        if (error) throw error;

        syncedAbandons = abandonsToInsert.length;
        setPendingAbandons([]);
        localStorage.removeItem(ABANDONS_KEY);
      }

      // Mark all readings as synced
      setReadings((prev) => prev.map((r) => ({ ...r, synced: true })));

      const messages: string[] = [];
      if (syncedReadings > 0) messages.push(`${syncedReadings} lecturas`);
      if (syncedAbandons > 0) messages.push(`${syncedAbandons} retirados`);

      toast({
        title: "Sincronizado",
        description: messages.join(" y ") + " sincronizados",
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

  // Handle status bib input change - validate and show runner info
  const handleStatusBibChange = (value: string) => {
    setStatusBibInput(value);
    const bib = parseInt(value);
    if (!isNaN(bib) && bib > 0) {
      const runner = runners.find((r) => r.bib_number === bib);
      setStatusRunnerInfo(runner || null);
    } else {
      setStatusRunnerInfo(null);
    }
  };

  // Handle status registration - saves to race_results_abandons (with offline support)
  const handleRegisterStatus = async () => {
    const bib = parseInt(statusBibInput);
    if (isNaN(bib) || bib <= 0) {
      toast({
        title: "Dorsal inválido",
        description: "Introduce un número de dorsal válido",
        variant: "destructive",
      });
      return;
    }

    if (!selectedStatus) {
      toast({
        title: "Estado requerido",
        description: "Selecciona un tipo de retirado",
        variant: "destructive",
      });
      return;
    }

    if (statusNotes.trim().length < 10) {
      toast({
        title: "Motivo requerido",
        description: "El motivo debe tener al menos 10 caracteres",
        variant: "destructive",
      });
      return;
    }

    const runner = runners.find((r) => r.bib_number === bib);
    
    if (!runner) {
      toast({
        title: "Dorsal no encontrado",
        description: "El dorsal debe estar registrado en la carrera",
        variant: "destructive",
      });
      return;
    }

    if (!selectedRace) {
      toast({
        title: "Error",
        description: "No hay carrera seleccionada",
        variant: "destructive",
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const runnerName = `${runner.first_name} ${runner.last_name}`.trim();

    // Create reading for visual feedback
    const reading: TimingReading = {
      bib_number: bib,
      timestamp,
      runner_name: runnerName,
      synced: false,
      status_code: selectedStatus,
      notes: statusNotes,
    };

    // Create pending abandon object
    const pendingAbandon: PendingAbandon = {
      bib_number: bib,
      abandon_type: selectedStatus,
      reason: statusNotes.trim(),
      timing_point_id: selectedTimingPoint?.id || null,
      registration_id: runner.registration_id,
      race_distance_id: runner.race_distance_id,
      runner_name: runnerName,
      timestamp,
    };

    setSubmittingStatus(true);

    // Try to sync immediately if online
    if (isOnline) {
      try {
        const { error } = await supabase.from("race_results_abandons").insert({
          race_id: selectedRace.id,
          registration_id: runner.registration_id,
          race_distance_id: runner.race_distance_id,
          bib_number: bib,
          abandon_type: selectedStatus,
          timing_point_id: selectedTimingPoint?.id || null,
          reason: statusNotes.trim(),
          operator_user_id: user?.id || null,
        });

        if (error) throw error;

        reading.synced = true;

        toast({
          title: `#${bib} - ${STATUS_OPTIONS.find(s => s.value === selectedStatus)?.label}`,
          description: `${runnerName} - Registrado correctamente`,
        });

        // Refresh abandons list
        if (selectedRace) fetchAbandons(selectedRace.id);
      } catch (error: any) {
        console.error("Error syncing abandon:", error);
        // Add to pending queue
        const newPending = [...pendingAbandons, pendingAbandon];
        setPendingAbandons(newPending);
        localStorage.setItem(ABANDONS_KEY, JSON.stringify(newPending));

        toast({
          title: `#${bib} guardado (offline)`,
          description: "Se sincronizará cuando haya conexión",
        });
      }
    } else {
      // Offline: add to pending queue
      const newPending = [...pendingAbandons, pendingAbandon];
      setPendingAbandons(newPending);
      localStorage.setItem(ABANDONS_KEY, JSON.stringify(newPending));

      toast({
        title: `#${bib} guardado (offline)`,
        description: "Se sincronizará cuando haya conexión",
      });
    }

    // Add to readings list for visual feedback
    setReadings((prev) => [reading, ...prev].slice(0, 50));

    // Reset form
    setStatusBibInput("");
    setSelectedStatus("");
    setStatusNotes("");
    setStatusRunnerInfo(null);
    setSubmittingStatus(false);
  };

  // Edit reading functions
  const handleOpenEditDialog = (reading: TimingReading) => {
    setEditingReading(reading);
    setEditBibInput(reading.bib_number.toString());
    // Format time for input (HH:MM:SS)
    const date = new Date(reading.timestamp);
    const timeStr = date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    setEditTimeInput(timeStr);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingReading) return;

    const newBib = parseInt(editBibInput);
    if (isNaN(newBib) || newBib <= 0) {
      toast({
        title: "Dorsal inválido",
        description: "Introduce un número de dorsal válido",
        variant: "destructive",
      });
      return;
    }

    // Parse time input and create new timestamp
    const timeParts = editTimeInput.split(":");
    if (timeParts.length < 2) {
      toast({
        title: "Hora inválida",
        description: "Formato de hora inválido (HH:MM:SS)",
        variant: "destructive",
      });
      return;
    }

    const originalDate = new Date(editingReading.timestamp);
    const newDate = new Date(originalDate);
    newDate.setHours(parseInt(timeParts[0]) || 0);
    newDate.setMinutes(parseInt(timeParts[1]) || 0);
    newDate.setSeconds(parseInt(timeParts[2]) || 0);

    const runner = runners.find((r) => r.bib_number === newBib);

    // Update the reading in state
    setReadings((prev) =>
      prev.map((r) =>
        r.timestamp === editingReading.timestamp && r.bib_number === editingReading.bib_number
          ? {
              ...r,
              bib_number: newBib,
              timestamp: newDate.toISOString(),
              runner_name: runner ? `${runner.first_name} ${runner.last_name}`.trim() : undefined,
              synced: false, // Mark as not synced since it was edited
            }
          : r
      )
    );

    // Also update in pending sync if exists
    setPendingSync((prev) =>
      prev.map((r) =>
        r.timestamp === editingReading.timestamp && r.bib_number === editingReading.bib_number
          ? {
              ...r,
              bib_number: newBib,
              timestamp: newDate.toISOString(),
              runner_name: runner ? `${runner.first_name} ${runner.last_name}`.trim() : undefined,
            }
          : r
      )
    );

    toast({
      title: "Lectura actualizada",
      description: `Dorsal #${newBib} - ${newDate.toLocaleTimeString("es-ES")}`,
    });

    setIsEditDialogOpen(false);
    setEditingReading(null);
  };

  const handleDeleteReading = async (reading: TimingReading) => {
    const confirm = window.confirm(
      `¿Eliminar lectura del dorsal #${reading.bib_number}?`
    );
    if (!confirm) return;

    // If reading has an ID (synced to DB), delete from database
    if (reading.id && reading.synced) {
      try {
        const { error } = await supabase
          .from("timing_readings")
          .delete()
          .eq("id", reading.id);

        if (error) throw error;

        toast({
          title: "Lectura eliminada",
          description: `Dorsal #${reading.bib_number} eliminado`,
        });
      } catch (error: any) {
        toast({
          title: "Error al eliminar",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
    }

    // Remove from local state
    setReadings((prev) =>
      prev.filter(
        (r) =>
          !(r.timestamp === reading.timestamp && r.bib_number === reading.bib_number)
      )
    );

    // Remove from pending sync if exists
    setPendingSync((prev) => {
      const newPending = prev.filter(
        (r) =>
          !(r.timestamp === reading.timestamp && r.bib_number === reading.bib_number)
      );
      localStorage.setItem(READINGS_KEY, JSON.stringify(newPending));
      return newPending;
    });
  };

  const handleLogout = async () => {
    const totalPending = pendingSync.length + pendingAbandons.length;
    if (totalPending > 0) {
      const confirm = window.confirm(
        `Tienes ${totalPending} registros sin sincronizar. ¿Deseas cerrar sesión igualmente?`
      );
      if (!confirm) return;
    }

    localStorage.removeItem(STORAGE_KEY);
    await supabase.auth.signOut();
    setCurrentView("login");
    setSelectedRace(null);
    setSelectedTimingPoint(null);
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
                <div className="text-center pt-2">
                  <Link 
                    to="/auth?returnTo=/timing" 
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ¿No tienes cuenta? Regístrate
                  </Link>
                </div>
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
              {races.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No tienes carreras asignadas
                </p>
              ) : races.length === 1 ? (
                <div className="space-y-2">
                  <Label>Carrera</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <p className="font-medium">{races[0].name}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(races[0].date).toLocaleDateString("es-ES")}
                    </p>
                  </div>
                </div>
              ) : (
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
              )}

              {selectedRace && timingPoints.length === 1 && (
                <div className="space-y-2">
                  <Label>Punto de Cronometraje</Label>
                  <div className="p-3 bg-muted rounded-md">
                    <p className="font-medium">
                      {timingPoints[0].point_order != null ? `${timingPoints[0].point_order}. ` : ""}
                      {timingPoints[0].name}
                    </p>
                  </div>
                </div>
              )}

              {selectedRace && timingPoints.length > 1 && (
                <div className="space-y-2">
                  <Label>Punto de Cronometraje</Label>
                  <Select
                    value={selectedTimingPoint?.id || ""}
                    onValueChange={handleSelectTimingPoint}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona punto de cronometraje" />
                    </SelectTrigger>
                    <SelectContent>
                      {timingPoints.map((tp) => (
                        <SelectItem key={tp.id} value={tp.id}>
                          {tp.point_order != null ? `${tp.point_order}. ` : ""}{tp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedRace && selectedTimingPoint && (
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
            <span className="font-bold">{selectedTimingPoint?.name}</span>
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
          {(pendingSync.length > 0 || pendingAbandons.length > 0) && (
            <Badge variant="secondary" className="text-xs">
              {pendingSync.length + pendingAbandons.length} pendientes
            </Badge>
          )}
        </div>
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "timing" | "status")} className="flex-1 flex flex-col">
        <TabsList className="mx-4 mt-2 grid w-[calc(100%-2rem)] grid-cols-2">
          <TabsTrigger value="timing" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Cronometraje
          </TabsTrigger>
          <TabsTrigger value="status" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Retirados
          </TabsTrigger>
        </TabsList>

        {/* Timing Tab */}
        <TabsContent value="timing" className="flex-1 flex flex-col mt-0">
          {/* Readings list */}
          <div className="flex-1 overflow-auto p-4 pb-48">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">
              ÚLTIMOS REGISTROS
              {raceStartTime && (
                <span className="ml-2 font-normal text-xs">
                  (Salida: {raceStartTime.toLocaleTimeString("es-ES")})
                </span>
              )}
            </h3>
            {readings.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Sin registros aún</p>
              </div>
            ) : (
              <div className="space-y-2">
                {readings.map((reading) => {
                  const raceTime = !reading.status_code ? calculateRaceTime(reading.timestamp) : null;
                  return (
                    <div
                      key={`${reading.bib_number}-${reading.timestamp}`}
                      className="flex items-center justify-between bg-card border border-border rounded-lg p-3"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant={reading.status_code ? "destructive" : "outline"} className="font-mono text-lg">
                          #{reading.bib_number}
                        </Badge>
                        <div>
                          <p className="font-medium">
                            {reading.runner_name || "Dorsal no registrado"}
                            {reading.status_code && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {STATUS_OPTIONS.find(s => s.value === reading.status_code)?.label}
                              </Badge>
                            )}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{new Date(reading.timestamp).toLocaleTimeString("es-ES")}</span>
                            {raceTime && (
                              <Badge variant="outline" className="font-mono text-xs bg-primary/10">
                                {raceTime}
                              </Badge>
                            )}
                            {reading.notes && <span>- {reading.notes.substring(0, 20)}...</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!reading.status_code && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleOpenEditDialog(reading)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteReading(reading)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        {reading.synced ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <Clock className="h-5 w-5 text-yellow-500" />
                        )}
                      </div>
                    </div>
                  );
                })}
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
                disabled={!isOnline || (pendingSync.length === 0 && pendingAbandons.length === 0) || syncing}
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
        </TabsContent>

        {/* Status Tab */}
        <TabsContent value="status" className="flex-1 flex flex-col mt-0 p-4 pb-20 overflow-auto">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Registrar Retirado
              </CardTitle>
              <CardDescription>
                Abandono, No Sale, Descalificado o En Carrera
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bib Number */}
              <div className="space-y-2">
                <Label htmlFor="status-bib">Dorsal</Label>
                <Input
                  id="status-bib"
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Número de dorsal"
                  value={statusBibInput}
                  onChange={(e) => handleStatusBibChange(e.target.value)}
                  className="text-xl font-mono"
                />
                {statusRunnerInfo && (
                  <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="font-medium text-green-800 dark:text-green-200">
                      {statusRunnerInfo.first_name} {statusRunnerInfo.last_name}
                    </p>
                    <p className="text-sm text-green-600 dark:text-green-400">
                      {statusRunnerInfo.event_name}
                    </p>
                  </div>
                )}
                {statusBibInput && !statusRunnerInfo && (
                  <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      Dorsal no encontrado en lista de inscritos
                    </p>
                  </div>
                )}
              </div>

              {/* Status Selection */}
              <div className="space-y-2">
                <Label>Tipo de Estado</Label>
                <div className="grid grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map((status) => (
                    <Button
                      key={status.value}
                      type="button"
                      variant={selectedStatus === status.value ? "default" : "outline"}
                      className="h-auto py-3 flex flex-col items-center gap-1"
                      onClick={() => setSelectedStatus(status.value)}
                    >
                      {status.icon}
                      <span className="font-bold">{status.label}</span>
                      <span className="text-xs opacity-70">{status.description}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="status-notes">Motivo (obligatorio)</Label>
                <Textarea
                  id="status-notes"
                  placeholder="Ej: Lesión rodilla km 15, Fuera de tiempo límite..."
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Mínimo 10 caracteres ({statusNotes.length}/10)
                </p>
              </div>

              {/* Submit Button */}
              <Button
                onClick={handleRegisterStatus}
                className="w-full"
                size="lg"
                disabled={submittingStatus || !statusBibInput || !selectedStatus || statusNotes.length < 10}
              >
                {submittingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <AlertTriangle className="h-4 w-4 mr-2" />
                )}
                Registrar Estado
              </Button>
            </CardContent>
          </Card>

          {/* Registered Abandons List */}
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Ban className="h-4 w-4" />
                  Retirados Registrados
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => selectedRace && fetchAbandons(selectedRace.id)}
                  disabled={loadingAbandons || !isOnline}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingAbandons ? 'animate-spin' : ''}`} />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingAbandons ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : registeredAbandons.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay retirados registrados
                </p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {registeredAbandons.map((abandon) => (
                    <div
                      key={abandon.id}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold">#{abandon.bib_number}</span>
                          <Badge variant="outline" className="text-xs">
                            {STATUS_OPTIONS.find(s => s.value === abandon.abandon_type)?.label || abandon.abandon_type}
                          </Badge>
                        </div>
                        {abandon.runner_name && (
                          <p className="text-sm text-muted-foreground truncate">
                            {abandon.runner_name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {abandon.reason}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleOpenEditAbandon(abandon)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteAbandon(abandon.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bottom actions for status tab */}
          <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleSync}
                disabled={!isOnline || (pendingSync.length === 0 && pendingAbandons.length === 0) || syncing}
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
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Lectura</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-bib">Dorsal</Label>
              <Input
                id="edit-bib"
                type="number"
                inputMode="numeric"
                value={editBibInput}
                onChange={(e) => setEditBibInput(e.target.value)}
                className="font-mono text-lg"
              />
              {editBibInput && (
                <p className="text-sm text-muted-foreground">
                  {runners.find(r => r.bib_number === parseInt(editBibInput))
                    ? `${runners.find(r => r.bib_number === parseInt(editBibInput))?.first_name} ${runners.find(r => r.bib_number === parseInt(editBibInput))?.last_name}`
                    : "Dorsal no encontrado"
                  }
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-time">Hora (HH:MM:SS)</Label>
              <Input
                id="edit-time"
                type="text"
                value={editTimeInput}
                onChange={(e) => setEditTimeInput(e.target.value)}
                placeholder="HH:MM:SS"
                className="font-mono text-lg"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Abandon Dialog */}
      <Dialog open={isEditAbandonDialogOpen} onOpenChange={setIsEditAbandonDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Retirado #{editingAbandon?.bib_number}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Tipo de Estado</Label>
              <div className="grid grid-cols-2 gap-2">
                {STATUS_OPTIONS.map((status) => (
                  <Button
                    key={status.value}
                    type="button"
                    variant={editAbandonType === status.value ? "default" : "outline"}
                    className="h-auto py-2 flex flex-col items-center gap-1"
                    onClick={() => setEditAbandonType(status.value)}
                  >
                    {status.icon}
                    <span className="text-xs font-bold">{status.label}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-abandon-reason">Motivo</Label>
              <Textarea
                id="edit-abandon-reason"
                value={editAbandonReason}
                onChange={(e) => setEditAbandonReason(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo 10 caracteres ({editAbandonReason.length}/10)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditAbandonDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveAbandon}
              disabled={savingAbandon || !editAbandonType || editAbandonReason.length < 10}
            >
              {savingAbandon ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TimingApp;
