import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mountain } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="fixed top-0 w-full bg-background/95 backdrop-blur-sm border-b border-border z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <Mountain className="h-6 w-6" />
            Camberas
          </Link>
          
          <div className="hidden md:flex items-center gap-6">
            <Link to="/races" className="text-foreground hover:text-primary transition-colors">
              Carreras
            </Link>
            <Link to="/timing-shop" className="text-foreground hover:text-primary transition-colors">
              Cronometraje
            </Link>
            <Button asChild variant="default">
              <Link to="/races">Inscríbete</Link>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
