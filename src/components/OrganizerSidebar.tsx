import { Home, ChevronDown, UserCircle, RectangleHorizontal } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
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
import { useMenuItems, type MenuItem } from "@/hooks/useMenuItems";
import { Skeleton } from "@/components/ui/skeleton";

type OrganizerView = string;

interface OrganizerSidebarProps {
  currentView: OrganizerView;
  onViewChange: (view: OrganizerView) => void;
}

export function OrganizerSidebar({ currentView, onViewChange }: OrganizerSidebarProps) {
  const { setOpenMobile, state } = useSidebar();
  const collapsed = state === "collapsed";
  const { groupedItems, loading } = useMenuItems({ menuType: "organizer" });

  const getIconComponent = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    return IconComponent || LucideIcons.Circle;
  };

  const handleItemClick = (view: OrganizerView) => {
    onViewChange(view);
    setOpenMobile(false);
  };

  const isGroupActive = (items: any[]) => {
    return items.some(item => item.view_name === currentView);
  };

  // Grupos desplegados. Hasta el primer clic: el primero y el que contiene
  // la pantalla actual (lo de siempre)
  const navigate = useNavigate();
  const [abiertos, setAbiertos] = useState<Set<string> | null>(null);
  const estaAbierto = (label: string, index: number, items: MenuItem[]) =>
    abiertos ? abiertos.has(label) : index === 0 || isGroupActive(items);

  // Un clic en el grupo lo despliega Y lleva a su primera opción, que suele
  // ser la más usada (antes eran dos clics). Si ya estás en una pantalla de
  // ese grupo no te mueve; al plegarlo tampoco.
  const cambiarGrupo = (label: string, abrir: boolean, items: MenuItem[]) => {
    setAbiertos((prev) => {
      const s = new Set(
        prev ?? groupedItems.filter((g, i) => estaAbierto(g.label, i, g.items)).map((g) => g.label),
      );
      if (abrir) s.add(label);
      else s.delete(label);
      return s;
    });
    if (!abrir || isGroupActive(items)) return;
    const primera = items[0];
    // Sin cerrar el menú en el móvil: así se ven las opciones del grupo
    if (primera?.view_name) onViewChange(primera.view_name);
    else if (primera?.route) navigate(primera.route);
  };

  if (loading) {
    return (
      <Sidebar collapsible="icon" className="border-r">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Organizador</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="space-y-2 p-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Organizador</SidebarGroupLabel>
          <SidebarGroupContent>
            {groupedItems.map((group, groupIndex) => (
              <Collapsible
                key={group.label}
                open={estaAbierto(group.label, groupIndex, group.items)}
                onOpenChange={(abrir) => cambiarGrupo(group.label, abrir, group.items)}
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
                    {group.items.map((item) => {
                      const Icon = getIconComponent(item.icon);
                      return (
                        <SidebarMenuItem key={item.id}>
                          {item.route ? (
                            <SidebarMenuButton asChild tooltip={item.title}>
                              <Link to={item.route} onClick={() => setOpenMobile(false)}>
                                <Icon className="h-4 w-4" />
                                <span>{item.title}</span>
                              </Link>
                            </SidebarMenuButton>
                          ) : (
                            <SidebarMenuButton
                              onClick={() => item.view_name && handleItemClick(item.view_name)}
                              isActive={currentView === item.view_name}
                              tooltip={item.title}
                            >
                              <Icon className="h-4 w-4" />
                              <span>{item.title}</span>
                            </SidebarMenuButton>
                          )}
                        </SidebarMenuItem>
                      );
                    })}
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
                  <Link to="/organizer-profile" onClick={() => setOpenMobile(false)}>
                    <UserCircle />
                    <span>Mi Perfil</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Diseñador de Dorsales">
                  <Link to="/organizer/bib-designer" onClick={() => setOpenMobile(false)}>
                    <RectangleHorizontal />
                    <span>Diseñador de Dorsales</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Volver al sitio">
                  <Link to="/" onClick={() => setOpenMobile(false)}>
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
