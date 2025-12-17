import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResultCardProps {
  position: number | null;
  bibNumber: number | null;
  runnerName: string;
  distanceName: string;
  finishTime: string;
  pace: string;
  categoryPosition?: number | null;
  genderPosition?: number | null;
  photoUrl?: string | null;
  isNew?: boolean;
  variant?: "default" | "compact" | "podium";
  className?: string;
}

export function ResultCard({
  position,
  bibNumber,
  runnerName,
  distanceName,
  finishTime,
  pace,
  categoryPosition,
  genderPosition,
  photoUrl,
  isNew = false,
  variant = "default",
  className
}: ResultCardProps) {
  const getPositionBadge = (pos: number | null) => {
    if (!pos) return null;
    if (pos === 1) return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg shadow-yellow-500/30">
        <Trophy className="h-6 w-6 text-white" />
      </div>
    );
    if (pos === 2) return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 shadow-lg shadow-gray-400/30">
        <Medal className="h-6 w-6 text-white" />
      </div>
    );
    if (pos === 3) return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 shadow-lg shadow-amber-500/30">
        <Award className="h-6 w-6 text-white" />
      </div>
    );
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted font-bold text-xl">
        {pos}
      </div>
    );
  };

  const initials = runnerName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (variant === "podium" && position && position <= 3) {
    return (
      <div 
        className={cn(
          "relative flex flex-col items-center p-6 rounded-xl border-2 bg-gradient-to-b transition-all duration-300",
          position === 1 && "from-yellow-500/20 to-yellow-500/5 border-yellow-500/50 shadow-lg shadow-yellow-500/20",
          position === 2 && "from-gray-400/20 to-gray-400/5 border-gray-400/50",
          position === 3 && "from-amber-600/20 to-amber-600/5 border-amber-600/50",
          isNew && "ring-2 ring-primary animate-pulse",
          className
        )}
      >
        {isNew && (
          <Badge className="absolute -top-2 -right-2 bg-green-500 animate-bounce">NUEVO</Badge>
        )}
        
        <div className="mb-4">{getPositionBadge(position)}</div>
        
        <Avatar className="h-16 w-16 mb-3 ring-2 ring-offset-2 ring-offset-background ring-primary/20">
          <AvatarImage src={photoUrl || undefined} />
          <AvatarFallback className="text-lg font-semibold bg-primary/10">{initials}</AvatarFallback>
        </Avatar>
        
        <h3 className="font-bold text-lg text-center">{runnerName}</h3>
        <Badge variant="secondary" className="mt-1">#{bibNumber}</Badge>
        
        <div className="mt-4 text-center">
          <p className="font-mono text-2xl font-bold text-primary">{finishTime}</p>
          <p className="text-sm text-muted-foreground">{pace} /km</p>
        </div>
        
        <Badge variant="outline" className="mt-3">{distanceName}</Badge>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div 
        className={cn(
          "flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors",
          isNew && "ring-2 ring-primary bg-primary/5",
          className
        )}
      >
        <Badge variant="secondary" className="w-12 justify-center font-mono font-bold">
          {position || '-'}º
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm">{runnerName}</p>
          <p className="text-xs text-muted-foreground">#{bibNumber}</p>
        </div>
        <p className="font-mono text-sm font-semibold">{finishTime}</p>
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex items-center gap-4 p-4 rounded-xl border bg-card transition-all duration-300 hover:shadow-md",
        isNew && "ring-2 ring-primary shadow-lg shadow-primary/20 animate-pulse",
        className
      )}
    >
      {getPositionBadge(position)}
      
      <Avatar className="h-12 w-12">
        <AvatarImage src={photoUrl || undefined} />
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">{initials}</AvatarFallback>
      </Avatar>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold truncate">{runnerName}</p>
          {isNew && <Badge className="bg-green-500 text-xs animate-pulse">NUEVO</Badge>}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>#{bibNumber}</span>
          <span>•</span>
          <span>{distanceName}</span>
        </div>
      </div>
      
      <div className="text-right shrink-0">
        <p className="font-mono font-bold text-lg">{finishTime}</p>
        <p className="text-sm text-muted-foreground">{pace} /km</p>
      </div>
      
      {(categoryPosition || genderPosition) && (
        <div className="hidden md:flex flex-col gap-1 text-right shrink-0">
          {categoryPosition && (
            <Badge variant="outline" className="text-xs">Cat: {categoryPosition}º</Badge>
          )}
          {genderPosition && (
            <Badge variant="outline" className="text-xs">Gén: {genderPosition}º</Badge>
          )}
        </div>
      )}
    </div>
  );
}
