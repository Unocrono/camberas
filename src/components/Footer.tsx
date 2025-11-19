import { Mountain } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-muted mt-20 border-t border-border">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 font-bold text-xl text-primary mb-4">
              <Mountain className="h-6 w-6" />
              Camberas
            </div>
            <p className="text-muted-foreground text-sm">
              Tu plataforma de carreras de montaña y trail running
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Carreras</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/races" className="text-muted-foreground hover:text-primary transition-colors">
                  Próximas carreras
                </Link>
              </li>
              <li>
                <Link to="/races" className="text-muted-foreground hover:text-primary transition-colors">
                  Resultados
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Servicios</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/timing-shop" className="text-muted-foreground hover:text-primary transition-colors">
                  Alquiler cronometraje
                </Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4 text-foreground">Contacto</h3>
            <p className="text-muted-foreground text-sm">
              info@camberas.com
            </p>
          </div>
        </div>
        
        <div className="mt-8 pt-8 border-t border-border text-center text-sm text-muted-foreground">
          © 2025 Camberas. Todos los derechos reservados.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
