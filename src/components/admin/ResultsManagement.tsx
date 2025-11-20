import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, Plus, Search, Image as ImageIcon, Pencil, Trash2 } from "lucide-react";

interface RaceResult {
  id: string;
  finish_time: string;
  overall_position: number | null;
  category_position: number | null;
  status: string;
  photo_url: string | null;
  notes: string | null;
  registration: {
    bib_number: number | null;
    race: { name: string };
    race_distance: { name: string };
    profiles: { first_name: string | null; last_name: string | null };
  };
}

const ResultsManagement = () => {
  const { toast } = useToast();
  const [races, setRaces] = useState<any[]>([]);
  const [selectedRace, setSelectedRace] = useState<string>("");
  const [results, setResults] = useState<RaceResult[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<RaceResult | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState({
    registration_id: "",
    finish_time: "",
    overall_position: "",
    category_position: "",
    status: "finished",
    notes: "",
  });

  useEffect(() => {
    fetchRaces();
  }, []);

  useEffect(() => {
    if (selectedRace) {
      fetchResults();
      fetchRegistrations();
    }
  }, [selectedRace]);

  const fetchRaces = async () => {
    const { data, error } = await supabase
      .from("races")
      .select("id, name, date")
      .order("date", { ascending: false });

    if (error) {
      toast({ title: "Error loading races", description: error.message, variant: "destructive" });
      return;
    }
    setRaces(data || []);
  };

  const fetchResults = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("race_results")
      .select(`
        *,
        registration:registrations (
          bib_number,
          race:races (name),
          race_distance:race_distances (name),
          profiles (first_name, last_name)
        )
      `)
      .eq("registration.race_id", selectedRace)
      .order("overall_position", { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: "Error loading results", description: error.message, variant: "destructive" });
    } else {
      setResults(data as any || []);
    }
    setLoading(false);
  };

  const fetchRegistrations = async () => {
    const { data, error } = await supabase
      .from("registrations")
      .select(`
        id,
        bib_number,
        race_distance:race_distances (name),
        profiles (first_name, last_name)
      `)
      .eq("race_id", selectedRace)
      .eq("status", "confirmed");

    if (error) {
      toast({ title: "Error loading registrations", description: error.message, variant: "destructive" });
    } else {
      setRegistrations(data || []);
    }
  };

  const handlePhotoUpload = async (registrationId: string): Promise<string | null> => {
    if (!photoFile) return null;

    const fileExt = photoFile.name.split('.').pop();
    const fileName = `${registrationId}-${Date.now()}.${fileExt}`;
    const filePath = `${selectedRace}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('race-photos')
      .upload(filePath, photoFile);

    if (uploadError) {
      console.error("Photo upload error:", uploadError);
      toast({ title: "Error uploading photo", description: uploadError.message, variant: "destructive" });
      return null;
    }

    const { data } = supabase.storage
      .from('race-photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Convert time string (HH:MM:SS) to PostgreSQL interval
      const timeParts = formData.finish_time.split(':');
      const hours = parseInt(timeParts[0] || '0');
      const minutes = parseInt(timeParts[1] || '0');
      const seconds = parseInt(timeParts[2] || '0');
      const intervalString = `${hours} hours ${minutes} minutes ${seconds} seconds`;

      let photoUrl = editingResult?.photo_url || null;
      if (photoFile) {
        photoUrl = await handlePhotoUpload(formData.registration_id);
      }

      const resultData = {
        registration_id: formData.registration_id,
        finish_time: intervalString,
        overall_position: formData.overall_position ? parseInt(formData.overall_position) : null,
        category_position: formData.category_position ? parseInt(formData.category_position) : null,
        status: formData.status,
        photo_url: photoUrl,
        notes: formData.notes || null,
      };

      let error;
      if (editingResult) {
        ({ error } = await supabase
          .from("race_results")
          .update(resultData)
          .eq("id", editingResult.id));
      } else {
        ({ error } = await supabase
          .from("race_results")
          .insert(resultData));
      }

      if (error) throw error;

      toast({
        title: editingResult ? "Result updated" : "Result added",
        description: "Race result has been saved successfully",
      });

      setIsDialogOpen(false);
      resetForm();
      fetchResults();
    } catch (error: any) {
      toast({ title: "Error saving result", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this result?")) return;

    const { error } = await supabase
      .from("race_results")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error deleting result", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Result deleted", description: "Race result has been removed" });
      fetchResults();
    }
  };

  const handleEdit = (result: RaceResult) => {
    setEditingResult(result);
    
    // Convert interval to HH:MM:SS format
    const timeMatch = result.finish_time.match(/(\d+):(\d+):(\d+)/);
    const timeString = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}` : "";

    setFormData({
      registration_id: result.registration.bib_number?.toString() || "",
      finish_time: timeString,
      overall_position: result.overall_position?.toString() || "",
      category_position: result.category_position?.toString() || "",
      status: result.status,
      notes: result.notes || "",
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      registration_id: "",
      finish_time: "",
      overall_position: "",
      category_position: "",
      status: "finished",
      notes: "",
    });
    setPhotoFile(null);
    setEditingResult(null);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      finished: { variant: "default", label: "Finished" },
      dnf: { variant: "destructive", label: "DNF" },
      dns: { variant: "secondary", label: "DNS" },
      dq: { variant: "outline", label: "DQ" },
    };
    const config = variants[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredResults = results.filter(result => {
    const search = searchTerm.toLowerCase();
    const bibNumber = result.registration.bib_number?.toString() || "";
    const firstName = result.registration.profiles?.first_name?.toLowerCase() || "";
    const lastName = result.registration.profiles?.last_name?.toLowerCase() || "";
    
    return bibNumber.includes(search) || 
           firstName.includes(search) || 
           lastName.includes(search);
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Race Results Management</CardTitle>
          <CardDescription>Upload and manage race timing data, rankings, and participant photos</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label>Select Race</Label>
              <Select value={selectedRace} onValueChange={setSelectedRace}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a race" />
                </SelectTrigger>
                <SelectContent>
                  {races.map(race => (
                    <SelectItem key={race.id} value={race.id}>
                      {race.name} - {new Date(race.date).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRace && (
              <>
                <div className="flex-1">
                  <Label>Search Results</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by bib or name..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="flex items-end">
                  <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) resetForm();
                  }}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Result
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingResult ? "Edit" : "Add"} Race Result</DialogTitle>
                        <DialogDescription>
                          Enter timing data and upload participant photo
                        </DialogDescription>
                      </DialogHeader>

                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Participant</Label>
                            <Select
                              value={formData.registration_id}
                              onValueChange={(value) => setFormData({ ...formData, registration_id: value })}
                              disabled={!!editingResult}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select participant" />
                              </SelectTrigger>
                              <SelectContent>
                                {registrations.map(reg => (
                                  <SelectItem key={reg.id} value={reg.id}>
                                    Bib #{reg.bib_number} - {reg.profiles?.first_name} {reg.profiles?.last_name} ({reg.race_distance?.name})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Finish Time (HH:MM:SS)</Label>
                            <Input
                              placeholder="01:30:45"
                              value={formData.finish_time}
                              onChange={(e) => setFormData({ ...formData, finish_time: e.target.value })}
                              pattern="\d{2}:\d{2}:\d{2}"
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Overall Position</Label>
                            <Input
                              type="number"
                              placeholder="1"
                              value={formData.overall_position}
                              onChange={(e) => setFormData({ ...formData, overall_position: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Category Position</Label>
                            <Input
                              type="number"
                              placeholder="1"
                              value={formData.category_position}
                              onChange={(e) => setFormData({ ...formData, category_position: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                              value={formData.status}
                              onValueChange={(value) => setFormData({ ...formData, status: value })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="finished">Finished</SelectItem>
                                <SelectItem value="dnf">DNF (Did Not Finish)</SelectItem>
                                <SelectItem value="dns">DNS (Did Not Start)</SelectItem>
                                <SelectItem value="dq">DQ (Disqualified)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Photo Upload</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea
                            placeholder="Additional notes..."
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            rows={3}
                          />
                        </div>

                        <div className="flex justify-end gap-3">
                          <Button type="button" variant="outline" onClick={() => {
                            setIsDialogOpen(false);
                            resetForm();
                          }}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : editingResult ? "Update" : "Add"} Result
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedRace && (
        <Card>
          <CardHeader>
            <CardTitle>Results ({filteredResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Loading results...</p>
            ) : filteredResults.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No results found</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pos</TableHead>
                      <TableHead>Bib</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Cat Pos</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Photo</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((result) => (
                      <TableRow key={result.id}>
                        <TableCell className="font-medium">{result.overall_position || "-"}</TableCell>
                        <TableCell>#{result.registration.bib_number}</TableCell>
                        <TableCell>
                          {result.registration.profiles?.first_name} {result.registration.profiles?.last_name}
                        </TableCell>
                        <TableCell>{result.registration.race_distance?.name}</TableCell>
                        <TableCell>{result.finish_time}</TableCell>
                        <TableCell>{result.category_position || "-"}</TableCell>
                        <TableCell>{getStatusBadge(result.status)}</TableCell>
                        <TableCell>
                          {result.photo_url ? (
                            <ImageIcon className="h-4 w-4 text-primary" />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => handleEdit(result)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(result.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ResultsManagement;
