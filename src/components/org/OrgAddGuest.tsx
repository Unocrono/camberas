/**
 * Añadir corredor — pantalla PROPIA de Camberas Org (formato móvil).
 *
 * El caso de uso: en la mesa de recogida aparece un despistado que no se
 * inscribió o no pagó; o un invitado (compromiso, prensa, autoridades,
 * colaborador). Se le inscribe en el momento con el formulario completo del
 * recorrido y se le da dorsal. Toda la lógica vive en AltaCorredor, la misma
 * que usa el panel en «Nueva inscripción».
 */
import { AltaCorredor } from "@/components/org/AltaCorredor";

interface Props {
  raceId: string | null;
}

export const OrgAddGuest = ({ raceId }: Props) => {
  if (!raceId) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Elige una carrera en la portada.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Para el que llega a la mesa sin haberse inscrito o sin pagar, o para un invitado. Funciona aunque las
        inscripciones estén cerradas.
      </p>
      <AltaCorredor raceId={raceId} />
    </div>
  );
};
