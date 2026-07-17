import { Calendar, MapPin, Mountain, Bike, Trophy, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

interface RaceCardProps {
  id: string;
  slug?: string | null;
  name: string;
  date: string;
  location: string;
  distances: string[];
  participants: number;
  imageUrl?: string;
  posterUrl?: string;
  raceType?: 'trail' | 'mtb';
  priceLabel?: string | null;
  isPast?: boolean;
}

const RaceCard = ({
  id, slug, name, date, location, distances,
  imageUrl, posterUrl, raceType = 'trail', priceLabel, isPast = false,
}: RaceCardProps) => {
  const raceUrl = slug ? `/race/${slug}` : `/race/${id}`;
  // El cartel vertical manda; si no hay, la imagen principal 16:9
  const cardImage = posterUrl || imageUrl;

  return (
    <Link
      to={raceUrl}
      className="group flex flex-col overflow-hidden rounded-2xl bg-card border border-border shadow-sm hover:shadow-elevated hover:-translate-y-1 transition-all duration-300"
    >
      {/* El cartel es el protagonista */}
      <div className="relative h-56 overflow-hidden bg-muted">
        {cardImage ? (
          <img
            src={cardImage}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-hero" />
        )}
        {/* Estado */}
        <span
          className={`absolute top-3 left-3 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
            isPast ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
          }`}
        >
          {isPast ? 'Finalizada' : 'Abiertas'}
        </span>
        {/* Deporte */}
        <span className="absolute top-3 right-3 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-primary text-primary-foreground">
          {raceType === 'mtb' ? <Bike className="h-3 w-3" /> : <Mountain className="h-3 w-3" />}
          {raceType === 'mtb' ? 'MTB' : 'Trail'}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          {raceType === 'mtb' ? 'MTB' : 'Trail'}
        </p>
        <h3 className="text-lg font-bold leading-tight mt-1 mb-3 text-foreground line-clamp-2">
          {name}
        </h3>

        <div className="space-y-1.5 text-sm font-medium text-muted-foreground mb-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>{date}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0" />
            <span className="line-clamp-1">{location}</span>
          </div>
        </div>

        {distances.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {distances.slice(0, 3).map((d) => (
              <span
                key={d}
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/15"
              >
                {d}
              </span>
            ))}
          </div>
        )}

        {/* Pie */}
        <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
          {isPast ? (
            <span className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary">
              <Trophy className="h-4 w-4" /> Resultados
            </span>
          ) : (
            <span className="font-archivo text-lg text-secondary">
              {priceLabel || 'Inscripción'}
            </span>
          )}
          <span className="flex items-center gap-1 text-sm font-bold text-primary group-hover:gap-2 transition-all">
            {isPast ? 'Ver' : 'Inscribirme'}
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
};

export default RaceCard;
