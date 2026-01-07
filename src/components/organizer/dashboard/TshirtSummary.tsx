import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface TshirtSummaryProps {
  raceId: string;
}

interface SizeData {
  size: string;
  count: number;
}

interface EventSizeData {
  eventId: string;
  eventName: string;
  sizes: SizeData[];
  total: number;
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function sortSizes(sizes: SizeData[]): SizeData[] {
  return sizes.sort((a, b) => {
    const aIndex = SIZE_ORDER.indexOf(a.size.toUpperCase());
    const bIndex = SIZE_ORDER.indexOf(b.size.toUpperCase());
    if (aIndex === -1 && bIndex === -1) return a.size.localeCompare(b.size);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function TshirtSummary({ raceId }: TshirtSummaryProps) {
  const [totalData, setTotalData] = useState<SizeData[]>([]);
  const [eventData, setEventData] = useState<EventSizeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Get registrations with tshirt_size directly from registrations table
        const { data: registrations, error: regError } = await supabase
          .from("registrations")
          .select(`
            id,
            tshirt_size,
            race_distance_id,
            race_distance:race_distances!registrations_race_distance_id_fkey (
              id,
              name
            )
          `)
          .eq("race_id", raceId)
          .in("status", ["confirmed", "pending"]);

        if (regError) throw regError;

        // Calculate total sizes
        const totalSizeMap = new Map<string, number>();
        // Calculate sizes per event
        const eventSizeMap = new Map<string, { name: string; sizes: Map<string, number> }>();

        registrations?.forEach(reg => {
          const size = reg.tshirt_size;
          if (size) {
            // Total
            totalSizeMap.set(size, (totalSizeMap.get(size) || 0) + 1);
            
            // Per event
            const eventId = reg.race_distance_id;
            const eventName = (reg.race_distance as any)?.name || "Sin evento";
            
            if (!eventSizeMap.has(eventId)) {
              eventSizeMap.set(eventId, { name: eventName, sizes: new Map() });
            }
            const eventEntry = eventSizeMap.get(eventId)!;
            eventEntry.sizes.set(size, (eventEntry.sizes.get(size) || 0) + 1);
          }
        });

        // Convert total map to array
        const totalResult: SizeData[] = Array.from(totalSizeMap.entries())
          .map(([size, count]) => ({ size, count }));
        setTotalData(sortSizes(totalResult));
        setTotalCount(totalResult.reduce((sum, item) => sum + item.count, 0));

        // Convert event map to array
        const eventResult: EventSizeData[] = Array.from(eventSizeMap.entries())
          .map(([eventId, data]) => ({
            eventId,
            eventName: data.name,
            sizes: sortSizes(Array.from(data.sizes.entries()).map(([size, count]) => ({ size, count }))),
            total: Array.from(data.sizes.values()).reduce((sum, count) => sum + count, 0)
          }))
          .sort((a, b) => a.eventName.localeCompare(b.eventName));
        setEventData(eventResult);

      } catch (error) {
        console.error("Error fetching tshirt data:", error);
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
          <CardTitle className="text-base">Tallas de Camiseta</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Tallas de Camiseta</span>
          {totalCount > 0 && (
            <Badge variant="outline" className="ml-2">
              Total: {totalCount}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {totalData.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin datos de tallas</p>
        ) : (
          <>
            {/* Total summary */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Resumen Total</p>
              <div className="flex flex-wrap gap-2">
                {totalData.map((item) => (
                  <Badge key={item.size} variant="secondary" className="text-sm px-3 py-1">
                    {item.size}: <span className="font-bold ml-1">{item.count}</span>
                  </Badge>
                ))}
              </div>
            </div>

            {/* Per event summary */}
            {eventData.length > 1 && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="events" className="border-none">
                  <AccordionTrigger className="text-sm font-medium text-muted-foreground py-2 hover:no-underline">
                    Ver por evento ({eventData.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pt-2">
                      {eventData.map((event) => (
                        <div key={event.eventId} className="border-l-2 border-muted pl-3">
                          <p className="text-sm font-medium mb-1">
                            {event.eventName}
                            <span className="text-muted-foreground font-normal ml-2">({event.total})</span>
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {event.sizes.map((item) => (
                              <Badge key={item.size} variant="outline" className="text-xs px-2 py-0.5">
                                {item.size}: {item.count}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
