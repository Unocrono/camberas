-- Ocultar la tarjeta "Soporte — Chat en la app" de /contact
-- (la app de chat de soporte no está operativa; el contacto se centraliza
-- en email/WhatsApp/formulario)
UPDATE public.contact_settings
SET support_chat_card_visible = false;
