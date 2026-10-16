# Tareas

- [x] Borrar los indicadores de `generate-training-plan` y `support-chat` y comprobar que Admin › Edge Functions muestra 5 funciones.
- [x] Copiar las dos migraciones ya aplicadas al historial de `supabase/migrations/`, sin ejecutarlas y conservando `drizzle/`.
- [x] Registrar la convención de ubicación y nombres para las nuevas migraciones.

- [x] Eliminar `generate-training-plan` del repositorio y del servidor.
- [x] Confirmar con Bernardo la eliminación de `training_plans` y su único plan guardado.
- [x] Eliminar `support-chat` del repositorio y del servidor.
- [x] Comprobar tablas exclusivas de `support-chat` y obtener confirmación individual para `chat_messages` y `chat_conversations`, ambas vacías.
- [x] Quitar las referencias a `training_plans`, `chat_messages` y `chat_conversations` de `admin-delete-user`.
- [x] Retirar la ruta, la página y los enlaces del asistente IA, incluida la consulta de su activación desde Navbar.
- [x] Obtener nueva confirmación individual para borrar `chat_messages` y `chat_conversations` tras quitar sus referencias de `admin-delete-user`.
- [x] Eliminar `chat_messages` y `chat_conversations` tras confirmación individual de Bernardo.
- [x] Desplegar la limpieza de `admin-delete-user` antes de eliminar las tablas relacionadas.
- [x] Eliminar `training_plans` y su plan guardado tras confirmación individual de Bernardo; sin cambios adicionales de permisos ni cron.