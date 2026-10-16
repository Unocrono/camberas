# Architecture rules

- Keep the retired AI assistant and training-plan features disconnected from navigation, routes, and account cleanup; their tables and function flags have been removed and must not be recreated.
- Write every new migration in `supabase/migrations/` as `AAAAMMDDHHMMSS_descripcion_en_espanol.sql`, never in `drizzle/migrations/`; that folder is kept only as the history of already-applied migrations.