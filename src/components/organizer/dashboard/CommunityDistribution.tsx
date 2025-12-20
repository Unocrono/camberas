import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";

interface CommunityDistributionProps {
  raceId: string;
}

interface CommunityData {
  community: string;
  count: number;
}

export function CommunityDistribution({ raceId }: CommunityDistributionProps) {
  const [data, setData] = useState<CommunityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Get registrations with profiles
        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select(`
            id,
            user_id,
            profiles:user_id(autonomous_community)
          `)
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (regError) throw regError;

        const regIds = registrations?.map(r => r.id) || [];

        // Get autonomous_community from responses
        const { data: responses, error: respError } = await supabase
          .from("registration_responses")
          .select(`
            registration_id,
            field_value,
            field:registration_form_fields!inner(field_name)
          `)
          .in("registration_id", regIds);

        if (respError) throw respError;

        const communityMap = new Map<string, number>();

        registrations?.forEach(reg => {
          let community = "Sin especificar";
          
          // First check profile
          if (reg.profiles && (reg.profiles as any).autonomous_community) {
            community = (reg.profiles as any).autonomous_community;
          } else {
            // Check responses
            const communityResponse = responses?.find(
              r => r.registration_id === reg.id && (r.field as any)?.field_name === "autonomous_community"
            );
            if (communityResponse && communityResponse.field_value) {
              community = communityResponse.field_value;
            }
          }

          communityMap.set(community, (communityMap.get(community) || 0) + 1);
        });

        const result: CommunityData[] = Array.from(communityMap.entries())
          .map(([community, count]) => ({ community, count }))
          .sort((a, b) => b.count - a.count);

        setData(result);
      } catch (error) {
        console.error("Error fetching community data:", error);
      } finally {
        setLoading(false);
      }
    }

    if (raceId) {
      fetchData();
    }
  }, [raceId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por Comunidad Autónoma</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Por Comunidad Autónoma</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[200px] pr-4">
          {data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin datos</p>
          ) : (
            <div className="space-y-2">
              {data.map((item) => (
                <div key={item.community} className="flex items-center justify-between py-1">
                  <span className="text-sm truncate flex-1 mr-2">{item.community}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold">{item.count}</span>
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {total > 0 ? Math.round((item.count / total) * 100) : 0}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
