# Tareas

- [x] Eliminar `generate-training-plan` del repositorio y del servidor.
- [x] Confirmar con Bernardo la eliminación de `training_plans` y su único plan guardado.
- [x] Eliminar `support-chat` del repositorio y del servidor.
- [x] Comprobar tablas exclusivas de `support-chat` y obtener confirmación individual para `chat_messages` y `chat_conversations`, ambas vacías.
- [ ] Eliminar `chat_messages` y `chat_conversations`: pendiente de permitir «Execute backward incompatible database migrations» en las preferencias de herramientas de Lovable Cloud; revisar antes las referencias de limpieza en `admin-delete-user` para no romper la eliminación de usuarios.
- [ ] Eliminar `training_plans`: pendiente de permitir «Execute backward incompatible database migrations» en las preferencias de herramientas de Lovable Cloud; no modificar RLS, permisos de la base de datos ni cron.