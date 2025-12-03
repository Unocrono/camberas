import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shirt, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TshirtSizesSummaryProps {
  selectedRaceId?: string;
}

interface SizeSummary {
  distanceId: string;
  distanceName: string;
  raceId: string;
  raceName: string;
  sizes: Record<string, number>;
  total: number;
}

const TSHIRT_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export function TshirtSizesSummary({ selectedRaceId }: TshirtSizesSummaryProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<SizeSummary[]>([]);

  useEffect(() => {
    if (user) {
      fetchTshirtSummary();
    }
  }, [user, selectedRaceId]);

  const fetchTshirtSummary = async () => {
    setLoading(true);
    try {
      // First get the organizer's races
      let racesQuery = supabase
        .from("races")
        .select("id, name")
        .eq("organizer_id", user!.id)
        .order("date", { ascending: false });

      if (selectedRaceId) {
        racesQuery = racesQuery.eq("id", selectedRaceId);
      }

      const { data: races, error: racesError } = await racesQuery;
      if (racesError) throw racesError;

      if (!races || races.length === 0) {
        setSummaries([]);
        setLoading(false);
        return;
      }

      const raceIds = races.map(r => r.id);

      // Get distances for these races
      const { data: distances, error: distancesError } = await supabase
        .from("race_distances")
        .select("id, name, race_id")
        .in("race_id", raceIds);

      if (distancesError) throw distancesError;

      if (!distances || distances.length === 0) {
        setSummaries([]);
        setLoading(false);
        return;
      }

      const distanceIds = distances.map(d => d.id);

      // Get tshirt_size field IDs for these distances
      const { data: fields, error: fieldsError } = await supabase
        .from("registration_form_fields")
        .select("id, race_distance_id")
        .eq("field_name", "tshirt_size")
        .in("race_distance_id", distanceIds);

      if (fieldsError) throw fieldsError;

      if (!fields || fields.length === 0) {
        setSummaries([]);
        setLoading(false);
        return;
      }

      const fieldIds = fields.map(f => f.id);
      const fieldToDistance = new Map(fields.map(f => [f.id, f.race_distance_id]));

      // Get all registrations for these races that are confirmed
      const { data: registrations, error: regsError } = await supabase
        .from("registrations")
        .select("id, race_distance_id")
        .in("race_id", raceIds)
        .eq("status", "confirmed");

      if (regsError) throw regsError;

      if (!registrations || registrations.length === 0) {
        // Return summaries with zero counts
        const emptySummaries: SizeSummary[] = distances.map(d => {
          const race = races.find(r => r.id === d.race_id);
          return {
            distanceId: d.id,
            distanceName: d.name,
            raceId: d.race_id,
            raceName: race?.name || "Desconocida",
            sizes: Object.fromEntries(TSHIRT_SIZES.map(s => [s, 0])),
            total: 0
          };
        });
        setSummaries(emptySummaries);
        setLoading(false);
        return;
      }

      const registrationIds = registrations.map(r => r.id);

      // Get tshirt size responses
      const { data: responses, error: responsesError } = await supabase
        .from("registration_responses")
        .select("registration_id, field_id, field_value")
        .in("field_id", fieldIds)
        .in("registration_id", registrationIds);

      if (responsesError) throw responsesError;

      // Build summaries
      const summaryMap = new Map<string, SizeSummary>();

      distances.forEach(d => {
        const race = races.find(r => r.id === d.race_id);
        summaryMap.set(d.id, {
          distanceId: d.id,
          distanceName: d.name,
          raceId: d.race_id,
          raceName: race?.name || "Desconocida",
          sizes: Object.fromEntries(TSHIRT_SIZES.map(s => [s, 0])),
          total: 0
        });
      });

      // Map registration to distance
      const regToDistance = new Map(registrations.map(r => [r.id, r.race_distance_id]));

      responses?.forEach(response => {
        const distanceId = regToDistance.get(response.registration_id);
        if (!distanceId) return;

        const summary = summaryMap.get(distanceId);
        if (!summary) return;

        const size = response.field_value?.toUpperCase().trim();
        if (TSHIRT_SIZES.includes(size)) {
          summary.sizes[size] = (summary.sizes[size] || 0) + 1;
          summary.total += 1;
        }
      });

      setSummaries(Array.from(summaryMap.values()).filter(s => s.total > 0 || !selectedRaceId));
    } catch (error) {
      console.error("Error fetching tshirt summary:", error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (summaries.length === 0) return;

    const headers = ["Carrera", "Distancia", ...TSHIRT_SIZES, "Total"];
    const rows = summaries.map(s => [
      s.raceName,
      s.distanceName,
      ...TSHIRT_SIZES.map(size => s.sizes[size] || 0),
      s.total
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `resumen_tallas_${new Date().toISOString().split("T")[0]}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const getTotals = () => {
    const totals: Record<string, number> = Object.fromEntries(TSHIRT_SIZES.map(s => [s, 0]));
    let grandTotal = 0;

    summaries.forEach(s => {
      TSHIRT_SIZES.forEach(size => {
        totals[size] += s.sizes[size] || 0;
      });
      grandTotal += s.total;
    });

    return { totals, grandTotal };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { totals, grandTotal } = getTotals();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shirt className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Resumen de Tallas de Camiseta</h2>
        </div>
        {summaries.length > 0 && (
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        )}
      </div>

      {summaries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shirt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay inscripciones confirmadas con talla de camiseta registrada
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {TSHIRT_SIZES.map(size => (
              <Card key={size}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Talla {size}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totals[size]}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Total Card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="text-lg font-medium">Total de Camisetas</span>
                <Badge variant="default" className="text-lg px-4 py-1">
                  {grandTotal}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detalle por Distancia</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Carrera</TableHead>
                    <TableHead>Distancia</TableHead>
                    {TSHIRT_SIZES.map(size => (
                      <TableHead key={size} className="text-center w-16">
                        {size}
                      </TableHead>
                    ))}
                    <TableHead className="text-center">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaries.map(summary => (
                    <TableRow key={summary.distanceId}>
                      <TableCell className="font-medium">{summary.raceName}</TableCell>
                      <TableCell>{summary.distanceName}</TableCell>
                      {TSHIRT_SIZES.map(size => (
                        <TableCell key={size} className="text-center">
                          {summary.sizes[size] || 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold">
                        {summary.total}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Total</TableCell>
                    {TSHIRT_SIZES.map(size => (
                      <TableCell key={size} className="text-center">
                        {totals[size]}
                      </TableCell>
                    ))}
                    <TableCell className="text-center">{grandTotal}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
