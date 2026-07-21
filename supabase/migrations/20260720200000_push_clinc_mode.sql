-- Modo de aviso por suscripcion: el servidor decide si envia o no.
-- each = cada pago | milestones = solo hitos | off = silencio
alter table public.push_subscriptions
  add column if not exists clinc_mode text not null default 'each';

do $chk$
begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_mode_check
    check (clinc_mode in ('each', 'milestones', 'off'));
exception when duplicate_object then
  null;
end $chk$;

-- Permitir que el usuario actualice el modo de sus propias suscripciones
drop policy if exists "own subs update" on public.push_subscriptions;
create policy "own subs update" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
