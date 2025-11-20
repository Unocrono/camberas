import { Calendar, Users, Home, Trophy } from "lucide-react";
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

type AdminView = "races" | "registrations" | "results";

interface AdminSidebarProps {
  currentView: AdminView;
  onViewChange: (view: AdminView) => void;
}

const menuItems = [
  { title: "Gestión de Carreras", view: "races" as AdminView, icon: Calendar },
  { title: "Inscripciones", view: "registrations" as AdminView, icon: Users },
  { title: "Resultados", view: "results" as AdminView, icon: Trophy },
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
                <SidebarMenuItem key={item.view}>
                  <SidebarMenuButton
                    onClick={() => onViewChange(item.view)}
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
