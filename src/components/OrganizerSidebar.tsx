import { Calendar, Users, Home, Trophy, Timer, Route, FolderOpen, HelpCircle, UserCircle, Map, Scale, RectangleHorizontal, FileText, Shirt, MapPin, UserCog, Radio, Clock, ChevronDown, Flag } from "lucide-react";
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

type OrganizerView = "races" | "distances" | "waves" | "checkpoints" | "timing-points" | "registrations" | "results" | "splits" | "timing-readings" | "storage" | "race-faqs" | "roadbooks" | "regulations" | "form-fields" | "tshirt-sizes" | "timer-assignments";

interface OrganizerSidebarProps {
  currentView: OrganizerView;
  onViewChange: (view: OrganizerView) => void;
}

interface MenuItem {
  title: string;
  view: OrganizerView;
  icon: typeof Calendar;
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
      { title: "Distancias", view: "distances", icon: Route },
      { title: "Oleadas de Salida", view: "waves", icon: Flag },
      { title: "Reglamento", view: "regulations", icon: Scale },
    ],
  },
  {
    label: "🗺️ Recorrido",
    items: [
      { title: "Puntos de Cronometraje", view: "timing-points", icon: Clock },
      { title: "Puntos de Control", view: "checkpoints", icon: MapPin },
      { title: "Rutómetros", view: "roadbooks", icon: Map },
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
      { title: "Cronometradores", view: "timer-assignments", icon: UserCog },
      { title: "Resultados", view: "results", icon: Trophy },
      { title: "Tiempos Parciales", view: "splits", icon: Timer },
      { title: "Lecturas Crono", view: "timing-readings", icon: Radio },
    ],
  },
  {
    label: "📁 Contenido",
    items: [
      { title: "Archivos Multimedia", view: "storage", icon: FolderOpen },
      { title: "FAQs de Carreras", view: "race-faqs", icon: HelpCircle },
    ],
  },
];

export function OrganizerSidebar({ currentView, onViewChange }: OrganizerSidebarProps) {
  const { setOpenMobile, state } = useSidebar();
  const collapsed = state === "collapsed";

  const handleItemClick = (view: OrganizerView) => {
    onViewChange(view);
    setOpenMobile(false);
  };

  const isGroupActive = (group: MenuGroup) => {
    return group.items.some(item => item.view === currentView);
  };

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Organizador</SidebarGroupLabel>
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
                      <SidebarMenuItem key={item.view}>
                        <SidebarMenuButton
                          onClick={() => handleItemClick(item.view)}
                          isActive={currentView === item.view}
                          tooltip={item.title}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
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
                <SidebarMenuButton asChild tooltip="Mi Perfil">
                  <Link to="/organizer-profile">
                    <UserCircle />
                    <span>Mi Perfil</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Diseñador de Dorsales">
                  <Link to="/organizer/bib-designer">
                    <RectangleHorizontal />
                    <span>Diseñador de Dorsales</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
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
