import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface LatestRegistrationsProps {
  raceId: string;
}

interface Registration {
  id: string;
  bib_number: number | null;
  created_at: string;
  race_distance: {
    name: string;
    price: number;
  } | null;
  profile: {
    first_name: string | null;
    last_name: string | null;
    gender: string | null;
  } | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
}

export function LatestRegistrations({ raceId }: LatestRegistrationsProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("registrations")
          .select(`
            id,
            bib_number,
            created_at,
            guest_first_name,
            guest_last_name,
            race_distance:race_distances(name, price),
            profile:profiles(first_name, last_name, gender)
          `)
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"])
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) throw error;
        setRegistrations((data as unknown as Registration[]) || []);
      } catch (error) {
        console.error("Error fetching latest registrations:", error);
      } finally {
        setLoading(false);
      }
    }

    if (raceId) {
      fetchData();
    }
  }, [raceId]);

  const getName = (reg: Registration) => {
    if (reg.profile?.first_name || reg.profile?.last_name) {
      return `${reg.profile.first_name || ""} ${reg.profile.last_name || ""}`.trim();
    }
    if (reg.guest_first_name || reg.guest_last_name) {
      return `${reg.guest_first_name || ""} ${reg.guest_last_name || ""}`.trim();
    }
    return "Sin nombre";
  };

  const getGenderBadge = (reg: Registration) => {
    const gender = reg.profile?.gender;
    if (!gender) return <Badge variant="outline">-</Badge>;
    
    if (gender === "Masculino" || gender === "M" || gender === "Male") {
      return <Badge variant="secondary">M</Badge>;
    }
    if (gender === "Femenino" || gender === "F" || gender === "Female") {
      return <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-100">F</Badge>;
    }
    return <Badge variant="outline">-</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos Inscritos</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Últimos Inscritos</CardTitle>
      </CardHeader>
      <CardContent>
        {registrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay inscripciones</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Dorsal</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right w-20">Importe</TableHead>
                <TableHead className="w-16 text-center">Sexo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.map((reg) => (
                <TableRow key={reg.id}>
                  <TableCell className="font-medium">
                    {reg.bib_number || "-"}
                  </TableCell>
                  <TableCell className="truncate max-w-[150px]">
                    {getName(reg)}
                  </TableCell>
                  <TableCell className="text-right">
                    {reg.race_distance?.price?.toFixed(0) || "0"}€
                  </TableCell>
                  <TableCell className="text-center">
                    {getGenderBadge(reg)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
