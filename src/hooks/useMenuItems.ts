import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MenuItem {
  id: string;
  menu_type: 'navbar' | 'organizer' | 'admin';
  title: string;
  icon: string;
  route: string | null;
  view_name: string | null;
  parent_id: string | null;
  group_label: string | null;
  display_order: number;
  is_visible: boolean;
  requires_auth: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuGroup {
  label: string;
  items: MenuItem[];
}

interface UseMenuItemsOptions {
  menuType: 'navbar' | 'organizer' | 'admin';
}

export function useMenuItems({ menuType }: UseMenuItemsOptions) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenuItems = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('menu_items')
        .select('*')
        .eq('menu_type', menuType)
        .eq('is_visible', true)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setMenuItems((data as MenuItem[]) || []);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching menu items:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMenuItems();
  }, [menuType]);

  // Group items by group_label
  const groupedItems = useMemo(() => {
    const groups: MenuGroup[] = [];
    const groupMap = new Map<string, MenuItem[]>();

    menuItems.forEach((item) => {
      const label = item.group_label || 'General';
      if (!groupMap.has(label)) {
        groupMap.set(label, []);
      }
      groupMap.get(label)!.push(item);
    });

    groupMap.forEach((items, label) => {
      groups.push({ label, items });
    });

    return groups;
  }, [menuItems]);

  return {
    menuItems,
    groupedItems,
    loading,
    error,
    refetch: fetchMenuItems,
  };
}
