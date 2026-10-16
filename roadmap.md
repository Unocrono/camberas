# Tareas

- [x] Eliminar `generate-training-plan` del repositorio y del servidor.
- [x] Confirmar con Bernardo la eliminación de `training_plans` y su único plan guardado.
- [x] Eliminar `support-chat` del repositorio y del servidor.
- [x] Comprobar tablas exclusivas de `support-chat` y obtener confirmación individual para `chat_messages` y `chat_conversations`, ambas vacías.
- [x] Quitar las referencias a `training_plans`, `chat_messages` y `chat_conversations` de `admin-delete-user`.
- [x] Retirar la ruta, la página y los enlaces del asistente IA, incluida la consulta de su activación desde Navbar.
- [x] Obtener nueva confirmación individual para borrar `chat_messages` y `chat_conversations` tras quitar sus referencias de `admin-delete-user`.
- [ ] Eliminar `chat_messages` y `chat_conversations`: pendiente de permitir «Execute backward incompatible database migrations» en las preferencias de herramientas de Lovable Cloud.
- [x] Desplegar la limpieza de `admin-delete-user` antes de eliminar las tablas relacionadas.
- [ ] Eliminar `training_plans`: pendiente de permitir «Execute backward incompatible database migrations» en las preferencias de herramientas de Lovable Cloud; no modificar RLS, permisos de la base de datos ni cron.