import { Link } from "react-router-dom";
import { NavLink } from "./NavLink";
import { Menu, User, Shield, Briefcase, Mail, MessageSquare } from "lucide-react";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useIsFunctionEnabled } from "@/hooks/useEdgeFunctionFlags";

const Navbar = () => {
  const { user, isAdmin, isOrganizer } = useAuth();
  const isTrainingPlanEnabled = useIsFunctionEnabled("generate-training-plan");
  const isSupportChatEnabled = useIsFunctionEnabled("support-chat");

  return (
    <nav className="fixed top-0 w-full bg-background/95 backdrop-blur-sm border-b border-border z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            Camberas
          </Link>

          {/* Mobile menu button - centered */}
          <div className="md:hidden flex-1 flex justify-center">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <nav className="flex flex-col gap-4 mt-8">
                  <NavLink to="/">Inicio</NavLink>
                  <NavLink to="/races">Carreras</NavLink>
                  {isOrganizer && <NavLink to="/faqs">FAQs</NavLink>}
                  <NavLink to="/contact">
                    <Mail className="h-4 w-4" />
                    Contacto
                  </NavLink>
                  {user && (
                    <NavLink to="/support">
                      <MessageSquare className="h-4 w-4" />
                      Soporte
                    </NavLink>
                  )}
                  {isTrainingPlanEnabled && <NavLink to="/training-plan">Plan de Entrenamiento</NavLink>}
                  {isSupportChatEnabled && <NavLink to="/support-chat">Soporte</NavLink>}
                  {isOrganizer && <NavLink to="/timing-shop">Cronometraje</NavLink>}
                  {isOrganizer && (
                    <NavLink to="/organizer" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Organizador
                    </NavLink>
                  )}
                  {isAdmin && (
                    <NavLink to="/admin" className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Admin
                    </NavLink>
                  )}
                  {user ? (
                    <Button asChild variant="default" className="w-full">
                      <Link to="/profile">
                        <User className="mr-2 h-4 w-4" />
                        Mi Perfil
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="default" className="w-full">
                      <Link to="/auth">Iniciar Sesión</Link>
                    </Button>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <NavLink to="/">Inicio</NavLink>
            <NavLink to="/races">Carreras</NavLink>
            {isOrganizer && <NavLink to="/faqs">FAQs</NavLink>}
            <NavLink to="/contact">Contacto</NavLink>
            {user && <NavLink to="/support">Soporte</NavLink>}
            {isTrainingPlanEnabled && <NavLink to="/training-plan">Plan de Entrenamiento</NavLink>}
            {isSupportChatEnabled && <NavLink to="/support-chat">Soporte</NavLink>}
            {isOrganizer && <NavLink to="/timing-shop">Cronometraje</NavLink>}
            {isOrganizer && (
              <NavLink to="/organizer" className="flex items-center gap-1">
                <Briefcase className="h-4 w-4" />
                Organizador
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin" className="flex items-center gap-1">
                <Shield className="h-4 w-4" />
                Admin
              </NavLink>
            )}
          </nav>

          {/* Desktop auth button */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              <Button asChild variant="default">
                <Link to="/profile">
                  <User className="mr-2 h-4 w-4" />
                  Mi Perfil
                </Link>
              </Button>
            ) : (
              <Button asChild variant="default">
                <Link to="/auth">Iniciar Sesión</Link>
              </Button>
            )}
          </div>

          {/* Empty div to balance layout on mobile */}
          <div className="md:hidden w-10" />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
