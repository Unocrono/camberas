import { Mountain } from "lucide-react";
import { Link } from "react-router-dom";
import NewsletterForm from "./NewsletterForm";

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
            <p className="text-muted-foreground text-sm mb-4">
              Tu plataforma de carreras de montaña y trail
            </p>
            {/* Newsletter */}
            <div className="mt-4">
              <h4 className="font-medium text-sm mb-2">Suscríbete al newsletter</h4>
              <NewsletterForm className="max-w-xs" />
            </div>
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
              <li>
                <Link to="/noticias" className="text-muted-foreground hover:text-primary transition-colors">
                  Noticias
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
        
        <div className="mt-8 pt-8 border-t border-border">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">
              © 2025 Camberas. Todos los derechos reservados.
            </p>
            <nav className="flex flex-wrap justify-center gap-4 text-sm">
              <Link to="/legal" className="text-muted-foreground hover:text-primary transition-colors">
                Aviso Legal
              </Link>
              <Link to="/privacy-policy" className="text-muted-foreground hover:text-primary transition-colors">
                Privacidad
              </Link>
              <Link to="/terms" className="text-muted-foreground hover:text-primary transition-colors">
                Términos
              </Link>
              <Link to="/cookies" className="text-muted-foreground hover:text-primary transition-colors">
                Cookies
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
