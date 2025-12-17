import { Calendar, Users, Home, Trophy, Timer, Zap, Route, HelpCircle, FolderOpen, MessageCircleQuestion, UserCheck, Map, Scale, FileText, MapPin, UserCog, Tag, MessageSquare, Settings, AlarmClock, Radio, Flag, ChevronDown, Satellite, Shirt } from "lucide-react";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type AdminView = "races" | "distances" | "waves" | "checkpoints" | "timing-points" | "registrations" | "results" | "results-status" | "splits" | "timing-readings" | "gps-readings" | "timer-assignments" | "edge-functions" | "organizer-faqs" | "storage" | "race-faqs" | "organizer-approval" | "roadbooks" | "regulations" | "form-fields" | "tshirt-sizes" | "users" | "roadbook-item-types" | "contact-settings";

interface AdminSidebarProps {
  currentView: AdminView;
  onViewChange: (view: AdminView) => void;
}

interface MenuItem {
  title: string;
  view: AdminView | null;
  icon: typeof Calendar;
  link?: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
  defaultOpen?: boolean;
}

const menuGroups: MenuGroup[] = [
  {
    label: "🏃 Carreras",
    defaultOpen: true,
    items: [
      { title: "Gestión de Carreras", view: "races", icon: Calendar },
      { title: "Recorridos", view: "distances", icon: Route },
      { title: "Reglamentos", view: "regulations", icon: Scale },
    ],
  },
  {
    label: "🗺️ Recorrido",
    items: [
      { title: "Puntos de Cronometraje", view: "timing-points", icon: Timer },
      { title: "Puntos de Control", view: "checkpoints", icon: MapPin },
      { title: "Rutómetros", view: "roadbooks", icon: Map },
      { title: "Tipos de Ítem Rutómetro", view: "roadbook-item-types", icon: Tag },
    ],
  },
  {
    label: "📝 Inscripciones",
    items: [
      { title: "Inscripciones", view: "registrations", icon: Users },
      { title: "Campos de Formulario", view: "form-fields", icon: FileText },
      { title: "Resumen de Tallas", view: "tshirt-sizes", icon: Shirt },
    ],
  },
  {
    label: "⏱️ Cronometraje",
    items: [
      { title: "Horas de Salida", view: "waves", icon: Flag },
      { title: "Cronometradores", view: "timer-assignments", icon: AlarmClock },
      { title: "Resultados", view: "results", icon: Trophy },
      { title: "Estados de Resultado", view: "results-status", icon: Tag },
      { title: "Tiempos Parciales", view: "splits", icon: Timer },
      { title: "Lecturas Crono", view: "timing-readings", icon: Radio },
      { title: "Visor de Lecturas GPS", view: "gps-readings", icon: Satellite },
    ],
  },
  {
    label: "📁 Contenido",
    items: [
      { title: "Archivos Multimedia", view: "storage", icon: FolderOpen },
      { title: "FAQs de Carreras", view: "race-faqs", icon: MessageCircleQuestion },
    ],
  },
  {
    label: "👥 Usuarios",
    items: [
      { title: "Gestión de Usuarios", view: "users", icon: UserCog },
      { title: "Aprobación Organizadores", view: "organizer-approval", icon: UserCheck },
      { title: "FAQs para Organizadores", view: "organizer-faqs", icon: HelpCircle },
    ],
  },
  {
    label: "⚙️ Sistema",
    items: [
      { title: "Funciones Edge", view: "edge-functions", icon: Zap },
      { title: "Configuración Contacto", view: "contact-settings", icon: Settings },
      { title: "Soporte", view: null, icon: MessageSquare, link: "/admin/support" },
    ],
  },
];

export function AdminSidebar({ currentView, onViewChange }: AdminSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  const isGroupActive = (group: MenuGroup) => {
    return group.items.some(item => item.view === currentView);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Administración</SidebarGroupLabel>
          <SidebarGroupContent>
            {menuGroups.map((group) => (
              <Collapsible
                key={group.label}
                defaultOpen={group.defaultOpen || isGroupActive(group)}
                className="group/collapsible"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
                  <span className={collapsed ? "sr-only" : ""}>{group.label}</span>
                  {!collapsed && (
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenu className="ml-2 border-l border-border pl-2">
                    {group.items.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        {item.link ? (
                          <SidebarMenuButton asChild tooltip={item.title}>
                            <Link to={item.link}>
                              <item.icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </Link>
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton
                            onClick={() => item.view && onViewChange(item.view)}
                            isActive={currentView === item.view}
                            tooltip={item.title}
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </SidebarMenuButton>
                        )}
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </CollapsibleContent>
              </Collapsible>
            ))}
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
