-- Asistente de WhatsApp: entrada propia en el menu del admin
--
-- La configuracion del bot (wa_bot_config) solo se podia tocar por SQL
-- (docs/whatsapp-alta-waba.md §7). La pantalla «whatsapp-bot» de
-- AdminDashboard la edita y ensena los ultimos mensajes.
--
-- Solo admin: wa_messages guarda telefonos y su politica de lectura es de
-- admin. Va junto a Contacto, en el grupo de Sistema.
--
-- El nombre del grupo lleva emoji y NO se escribe aqui: se copia de la fila
-- vecina (contact-settings). Asi el SQL es ASCII puro.

INSERT INTO public.menu_items
  (menu_type, title, icon, route, view_name, parent_id, group_label, display_order, is_visible, requires_auth)
SELECT 'admin', 'WhatsApp', 'MessageCircle', NULL, 'whatsapp-bot', NULL,
       (SELECT m.group_label FROM public.menu_items m
        WHERE m.menu_type = 'admin' AND m.view_name = 'contact-settings'
        LIMIT 1),
       (SELECT m.display_order + 1 FROM public.menu_items m
        WHERE m.menu_type = 'admin' AND m.view_name = 'contact-settings'
        LIMIT 1),
       true, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items m
  WHERE m.menu_type = 'admin' AND m.view_name = 'whatsapp-bot'
);

-- Comprobacion: una fila, con el grupo de Contacto
SELECT menu_type, group_label, display_order, title, view_name, icon
FROM public.menu_items
WHERE view_name IN ('contact-settings', 'whatsapp-bot')
ORDER BY display_order;
