import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Clock, MapPin } from "lucide-react";

interface Checkpoint {
  id: string;
  name: string;
  checkpoint_order: number;
  distance_km: number;
  race_id: string;
}

interface RaceResult {
  id: string;
  registration: {
    bib_number: number;
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
}

interface SplitTime {
  id: string;
  checkpoint_name: string;
  checkpoint_order: number;
  split_time: any;
  distance_km: number;
}

interface SplitTimesManagementProps {
  isOrganizer?: boolean;
  selectedRaceId?: string;
}

export function SplitTimesManagement({ isOrganizer = false, selectedRaceId: propSelectedRaceId }: SplitTimesManagementProps) {
  const [races, setRaces] = useState<any[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<string>("");
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<string>("");
  const [splitTimes, setSplitTimes] = useState<SplitTime[]>([]);
  
  // Checkpoint form state
  const [isCheckpointDialogOpen, setIsCheckpointDialogOpen] = useState(false);
  const [checkpointForm, setCheckpointForm] = useState({
    name: "",
    checkpoint_order: 1,
    distance_km: 0,
  });

  // Split time form state
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false);
  const [splitForm, setSplitForm] = useState({
    checkpoint_id: "",
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    // If propSelectedRaceId changes, update the internal selectedRaceId
    if (propSelectedRaceId) {
      setSelectedRaceId(propSelectedRaceId);
    } else {
      setSelectedRaceId("");
    }
  }, [propSelectedRaceId]);

  useEffect(() => {
    if (selectedRaceId) {
      fetchCheckpoints();
      fetchRaceResults();
    }
  }, [selectedRaceId]);

  useEffect(() => {
    if (selectedResultId) {
      fetchSplitTimes();
    }
  }, [selectedResultId]);

  const fetchRaces = async () => {
    let query = supabase
      .from("races")
      .select("id, name, date, organizer_id")
      .order("date", { ascending: false });
    
    // If organizer mode, filter by current user's races
    if (isOrganizer) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        query = query.eq("organizer_id", user.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      toast.error("Error al cargar carreras");
      return;
    }

    setRaces(data || []);
  };

  const fetchCheckpoints = async () => {
    const { data, error } = await supabase
      .from("race_checkpoints")
      .select("*")
      .eq("race_id", selectedRaceId)
      .order("checkpoint_order");

    if (error) {
      toast.error("Failed to load checkpoints");
      return;
    }

    setCheckpoints(data || []);
  };

  const fetchRaceResults = async () => {
    const { data, error } = await supabase
      .from("race_results")
      .select(`
        id,
        registration:registrations!inner (
          bib_number,
          race_id
        )
      `)
      .eq("registration.race_id", selectedRaceId)
      .eq("status", "finished");

    if (error) {
      toast.error("Failed to load race results");
      return;
    }

    // Fetch profiles separately
    if (data && data.length > 0) {
      const userIds = data.map((r: any) => r.registration.user_id);
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", userIds);

      const profilesMap = new Map(profilesData?.map((p: any) => [p.id, p]));
      const enrichedData = data.map((r: any) => ({
        ...r,
        registration: {
          ...r.registration,
          profiles: profilesMap.get(r.registration.user_id) || {
            first_name: "",
            last_name: "",
          },
        },
      }));
      setRaceResults(enrichedData as RaceResult[]);
    } else {
      setRaceResults([]);
    }
  };

  const fetchSplitTimes = async () => {
    const { data, error } = await supabase
      .from("split_times")
      .select("*")
      .eq("race_result_id", selectedResultId)
      .order("checkpoint_order");

    if (error) {
      toast.error("Failed to load split times");
      return;
    }

    setSplitTimes(data || []);
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();

    const { error } = await supabase.from("race_checkpoints").insert({
      race_id: selectedRaceId,
      name: checkpointForm.name,
      checkpoint_order: checkpointForm.checkpoint_order,
      distance_km: checkpointForm.distance_km,
    });

    if (error) {
      toast.error("Failed to create checkpoint");
      return;
    }

    toast.success("Checkpoint created");
    setIsCheckpointDialogOpen(false);
    setCheckpointForm({ name: "", checkpoint_order: 1, distance_km: 0 });
    fetchCheckpoints();
  };

  const handleDeleteCheckpoint = async (id: string) => {
    const { error } = await supabase
      .from("race_checkpoints")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Failed to delete checkpoint");
      return;
    }

    toast.success("Checkpoint deleted");
    fetchCheckpoints();
  };

  const handleRecordSplit = async (e: React.FormEvent) => {
    e.preventDefault();

    const checkpoint = checkpoints.find((c) => c.id === splitForm.checkpoint_id);
    if (!checkpoint) return;

    const totalSeconds =
      splitForm.hours * 3600 + splitForm.minutes * 60 + splitForm.seconds;
    const interval = `${splitForm.hours
      .toString()
      .padStart(2, "0")}:${splitForm.minutes
      .toString()
      .padStart(2, "0")}:${splitForm.seconds.toString().padStart(2, "0")}`;

    const { error } = await supabase.from("split_times").insert({
      race_result_id: selectedResultId,
      checkpoint_name: checkpoint.name,
      checkpoint_order: checkpoint.checkpoint_order,
      split_time: interval,
      distance_km: checkpoint.distance_km,
    });

    if (error) {
      toast.error("Failed to record split time");
      return;
    }

    toast.success("Split time recorded");
    setIsSplitDialogOpen(false);
    setSplitForm({ checkpoint_id: "", hours: 0, minutes: 0, seconds: 0 });
    fetchSplitTimes();
  };

  const handleDeleteSplit = async (id: string) => {
    const { error } = await supabase.from("split_times").delete().eq("id", id);

    if (error) {
      toast.error("Failed to delete split time");
      return;
    }

    toast.success("Split time deleted");
    fetchSplitTimes();
  };

  const formatTime = (timeString: string): string => {
    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}:${match[3]}`;
    }
    return timeString;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Split Times Management</h2>
      </div>

      {selectedRaceId && (
        <>
          {/* Checkpoints Management */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Race Checkpoints
              </CardTitle>
              <Dialog
                open={isCheckpointDialogOpen}
                onOpenChange={setIsCheckpointDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Checkpoint
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Checkpoint</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateCheckpoint} className="space-y-4">
                    <div>
                      <Label htmlFor="name">Checkpoint Name</Label>
                      <Input
                        id="name"
                        value={checkpointForm.name}
                        onChange={(e) =>
                          setCheckpointForm({
                            ...checkpointForm,
                            name: e.target.value,
                          })
                        }
                        placeholder="e.g., Aid Station 1"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="order">Order</Label>
                      <Input
                        id="order"
                        type="number"
                        min="1"
                        value={checkpointForm.checkpoint_order}
                        onChange={(e) =>
                          setCheckpointForm({
                            ...checkpointForm,
                            checkpoint_order: parseInt(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="distance">Distance (km)</Label>
                      <Input
                        id="distance"
                        type="number"
                        step="0.001"
                        min="0"
                        value={checkpointForm.distance_km}
                        onChange={(e) =>
                          setCheckpointForm({
                            ...checkpointForm,
                            distance_km: parseFloat(e.target.value),
                          })
                        }
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full">
                      Create Checkpoint
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {checkpoints.map((checkpoint) => (
                  <div
                    key={checkpoint.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <Badge>{checkpoint.checkpoint_order}</Badge>
                      <div>
                        <p className="font-medium">{checkpoint.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {checkpoint.distance_km} km
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteCheckpoint(checkpoint.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {checkpoints.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No checkpoints configured. Add checkpoints to start tracking
                    split times.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Participant Selection & Split Times */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Record Split Times
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Participant</Label>
                <Select
                  value={selectedResultId}
                  onValueChange={setSelectedResultId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a participant" />
                  </SelectTrigger>
                  <SelectContent>
                    {raceResults.map((result) => (
                      <SelectItem key={result.id} value={result.id}>
                        #{result.registration.bib_number} -{" "}
                        {result.registration.profiles.first_name}{" "}
                        {result.registration.profiles.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedResultId && (
                <>
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Split Times</h4>
                    <Dialog
                      open={isSplitDialogOpen}
                      onOpenChange={setIsSplitDialogOpen}
                    >
                      <DialogTrigger asChild>
                        <Button disabled={checkpoints.length === 0}>
                          <Plus className="mr-2 h-4 w-4" />
                          Record Split
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Record Split Time</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleRecordSplit} className="space-y-4">
                          <div>
                            <Label>Checkpoint</Label>
                            <Select
                              value={splitForm.checkpoint_id}
                              onValueChange={(value) =>
                                setSplitForm({ ...splitForm, checkpoint_id: value })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select checkpoint" />
                              </SelectTrigger>
                              <SelectContent>
                                {checkpoints.map((checkpoint) => (
                                  <SelectItem
                                    key={checkpoint.id}
                                    value={checkpoint.id}
                                  >
                                    {checkpoint.name} ({checkpoint.distance_km} km)
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label htmlFor="hours">Hours</Label>
                              <Input
                                id="hours"
                                type="number"
                                min="0"
                                value={splitForm.hours}
                                onChange={(e) =>
                                  setSplitForm({
                                    ...splitForm,
                                    hours: parseInt(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="minutes">Minutes</Label>
                              <Input
                                id="minutes"
                                type="number"
                                min="0"
                                max="59"
                                value={splitForm.minutes}
                                onChange={(e) =>
                                  setSplitForm({
                                    ...splitForm,
                                    minutes: parseInt(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div>
                              <Label htmlFor="seconds">Seconds</Label>
                              <Input
                                id="seconds"
                                type="number"
                                min="0"
                                max="59"
                                value={splitForm.seconds}
                                onChange={(e) =>
                                  setSplitForm({
                                    ...splitForm,
                                    seconds: parseInt(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                          </div>
                          <Button type="submit" className="w-full">
                            Record Split Time
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="space-y-2">
                    {splitTimes.map((split) => (
                      <div
                        key={split.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary">
                            {split.checkpoint_order}
                          </Badge>
                          <div>
                            <p className="font-medium">{split.checkpoint_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {split.distance_km} km
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-mono font-bold">
                            {formatTime(split.split_time)}
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteSplit(split.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {splitTimes.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No split times recorded yet.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
