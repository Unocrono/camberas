import { Calendar, Users, Home, Trophy, Timer, Route, FolderOpen, HelpCircle } from "lucide-react";
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

type OrganizerView = "races" | "distances" | "registrations" | "results" | "splits" | "storage" | "race-faqs";

interface OrganizerSidebarProps {
  currentView: OrganizerView;
  onViewChange: (view: OrganizerView) => void;
}

const menuItems = [
  { title: "Gestión de Carreras", view: "races" as OrganizerView, icon: Calendar },
  { title: "Distancias", view: "distances" as OrganizerView, icon: Route },
  { title: "Inscripciones", view: "registrations" as OrganizerView, icon: Users },
  { title: "Resultados", view: "results" as OrganizerView, icon: Trophy },
  { title: "Tiempos Parciales", view: "splits" as OrganizerView, icon: Timer },
  { title: "Archivos Multimedia", view: "storage" as OrganizerView, icon: FolderOpen },
  { title: "FAQs de Carreras", view: "race-faqs" as OrganizerView, icon: HelpCircle },
];

export function OrganizerSidebar({ currentView, onViewChange }: OrganizerSidebarProps) {
  const { setOpenMobile } = useSidebar();

  const handleItemClick = (view: OrganizerView) => {
    onViewChange(view);
    setOpenMobile(false); // Cierra el sidebar en móvil después de seleccionar
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Organizador</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    onClick={() => handleItemClick(item.view)}
                    isActive={currentView === item.view}
                    tooltip={item.title}
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
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
