import { Calendar, Users, Home, Trophy, Timer, Zap, Route, HelpCircle, FolderOpen, MessageCircleQuestion, UserCheck, Map, Scale, FileText, MapPin, UserCog, Tag, MessageSquare, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

type AdminView = "races" | "distances" | "checkpoints" | "registrations" | "results" | "splits" | "edge-functions" | "organizer-faqs" | "storage" | "race-faqs" | "organizer-approval" | "roadbooks" | "regulations" | "form-fields" | "users" | "roadbook-item-types" | "contact-settings";

interface AdminSidebarProps {
  currentView: AdminView;
  onViewChange: (view: AdminView) => void;
}

const menuItems = [
  { title: "Gestión de Carreras", view: "races" as AdminView, icon: Calendar },
  { title: "Distancias", view: "distances" as AdminView, icon: Route },
  { title: "Puntos de Control", view: "checkpoints" as AdminView, icon: MapPin },
  { title: "Rutómetros", view: "roadbooks" as AdminView, icon: Map },
  { title: "Tipos de Ítem Rutómetro", view: "roadbook-item-types" as AdminView, icon: Tag },
  { title: "Reglamentos", view: "regulations" as AdminView, icon: Scale },
  { title: "Campos de Formulario", view: "form-fields" as AdminView, icon: FileText },
  { title: "Inscripciones", view: "registrations" as AdminView, icon: Users },
  { title: "Resultados", view: "results" as AdminView, icon: Trophy },
  { title: "Tiempos Parciales", view: "splits" as AdminView, icon: Timer },
  { title: "Archivos Multimedia", view: "storage" as AdminView, icon: FolderOpen },
  { title: "FAQs de Carreras", view: "race-faqs" as AdminView, icon: MessageCircleQuestion },
  { title: "FAQs para Organizadores", view: "organizer-faqs" as AdminView, icon: HelpCircle },
  { title: "Aprobación Organizadores", view: "organizer-approval" as AdminView, icon: UserCheck },
  { title: "Gestión de Usuarios", view: "users" as AdminView, icon: UserCog },
  { title: "Funciones Edge", view: "edge-functions" as AdminView, icon: Zap },
  { title: "Configuración Contacto", view: "contact-settings" as AdminView, icon: Settings },
  { title: "Soporte", view: null, icon: MessageSquare, link: "/admin/support" },
];

export function AdminSidebar({ currentView, onViewChange }: AdminSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.link ? (
                    <SidebarMenuButton asChild tooltip={item.title}>
                      <Link to={item.link}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      onClick={() => item.view && onViewChange(item.view)}
                      isActive={currentView === item.view}
                      tooltip={item.title}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Volver al sitio">
                  <Link to="/">
                    <Home />
                    <span>Volver al sitio</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
