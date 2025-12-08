import { Flag, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Race {
  id: string;
  name: string;
  date: string;
  race_type: string;
}

interface RaceSelectorHeaderProps {
  races: Race[];
  selectedRaceId: string;
  selectedRace?: Race;
  onSelectRace: (raceId: string) => void;
  onClearSelection: () => void;
  loading?: boolean;
}

export const RaceSelectorHeader = ({
  races,
  selectedRaceId,
  selectedRace,
  onSelectRace,
  onClearSelection,
  loading = false,
}: RaceSelectorHeaderProps) => {
  if (races.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={selectedRaceId ? "default" : "outline"} 
            size="sm"
            className={cn(
              "gap-2 max-w-[300px]",
              selectedRaceId && "bg-primary text-primary-foreground"
            )}
            disabled={loading}
          >
            <Flag className="h-4 w-4 shrink-0" />
            <span className="truncate">
              {selectedRace ? selectedRace.name : "Seleccionar carrera"}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[320px] max-h-[400px] overflow-y-auto">
          {selectedRaceId && (
            <>
              <DropdownMenuItem 
                onClick={onClearSelection}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4 mr-2" />
                Quitar selección
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {races.map((race) => (
            <DropdownMenuItem
              key={race.id}
              onClick={() => onSelectRace(race.id)}
              className={cn(
                "flex items-center justify-between gap-2",
                race.id === selectedRaceId && "bg-primary/10"
              )}
            >
              <div className="flex flex-col min-w-0">
                <span className="truncate font-medium">{race.name}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(race.date).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric"
                  })}
                </span>
              </div>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {race.race_type}
              </Badge>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      
      {selectedRace && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClearSelection}
          title="Quitar selección"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
