import { Home, ChevronDown, UserCircle, RectangleHorizontal } from "lucide-react";
import * as LucideIcons from "lucide-react";
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
import { useMenuItems } from "@/hooks/useMenuItems";
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
                defaultOpen={groupIndex === 0 || isGroupActive(group.items)}
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
