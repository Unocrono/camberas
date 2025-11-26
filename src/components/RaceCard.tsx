import { Calendar, MapPin, Users, Mountain, Bike } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface RaceCardProps {
  id: string;
  name: string;
  date: string;
  location: string;
  distances: string[];
  participants: number;
  imageUrl?: string;
  raceType?: 'trail' | 'mtb';
}

const RaceCard = ({ id, name, date, location, distances, participants, imageUrl, raceType = 'trail' }: RaceCardProps) => {
  return (
    <Card className="overflow-hidden hover:shadow-elevated transition-all duration-300 group">
      <div className="relative h-48 overflow-hidden">
        <img 
          src={imageUrl || "/placeholder.svg"} 
          alt={name}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
        />
        <div className="absolute top-4 left-4">
          <Badge variant="default" className="bg-primary/90 backdrop-blur-sm flex items-center gap-1">
            {raceType === 'mtb' ? <Bike className="h-3 w-3" /> : <Mountain className="h-3 w-3" />}
            {raceType === 'mtb' ? 'MTB' : 'Trail'}
          </Badge>
        </div>
        <div className="absolute top-4 right-4 flex gap-2">
          {distances.map((distance) => (
            <Badge key={distance} variant="secondary" className="bg-secondary/90 backdrop-blur-sm">
              {distance}
            </Badge>
          ))}
        </div>
      </div>
      
      <CardContent className="pt-6">
        <h3 className="text-xl font-bold text-foreground mb-4">{name}</h3>
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span className="text-sm">{date}</span>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="text-sm">{location}</span>
          </div>
          
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4" />
            <span className="text-sm">{participants} participantes</span>
          </div>
        </div>
      </CardContent>
      
      <CardFooter>
        <Button asChild className="w-full">
          <Link to={`/race/${id}`}>Ver detalles</Link>
        </Button>
      </CardFooter>
    </Card>
  );
};

export default RaceCard;
