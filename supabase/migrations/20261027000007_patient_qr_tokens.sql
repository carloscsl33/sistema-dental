-- Códigos opacos: no contienen nombre, ID ni URL y no son una credencial de acceso.
create table public.patient_qr_tokens (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  token text not null unique check (token ~ '^TD-[A-Z0-9]{8}$'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.patient_qr_tokens enable row level security;
revoke all on public.patient_qr_tokens from anon, authenticated;
grant insert, update, delete on public.patient_qr_tokens to authenticated;
create policy qr_tokens_create on public.patient_qr_tokens for insert to authenticated
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy qr_tokens_update on public.patient_qr_tokens for update to authenticated
  using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role))
  with check ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy qr_tokens_delete on public.patient_qr_tokens for delete to authenticated
  using ((select private.is_admin()));

create or replace function public.get_patient_qr_token(p_patient_id uuid)
returns text language plpgsql security definer set search_path = public, private as $$
declare v_token text;
begin
  if private.current_role() not in ('admin'::public.app_role, 'receptionist'::public.app_role) then
    raise exception 'not_authorized';
  end if;
  select token into v_token from public.patient_qr_tokens where patient_id = p_patient_id;
  return v_token;
end; $$;

create or replace function public.resolve_patient_qr_token(p_token text)
returns uuid language plpgsql security definer set search_path = public, private as $$
declare v_patient_id uuid;
begin
  if not private.is_approved() then raise exception 'not_authorized'; end if;
  select patient_id into v_patient_id from public.patient_qr_tokens where token = upper(trim(p_token));
  return v_patient_id;
end; $$;

revoke all on function public.get_patient_qr_token(uuid) from public;
revoke all on function public.resolve_patient_qr_token(text) from public;
grant execute on function public.get_patient_qr_token(uuid) to authenticated;
grant execute on function public.resolve_patient_qr_token(text) to authenticated;
