
create type public.app_role as enum ('admin', 'receptionist', 'doctor');

alter table public.profiles
  add column role public.app_role not null default 'receptionist';

comment on column public.profiles.role is
  'Rol interno de Thera-dent. No usar user_metadata para autorización.';

create index profiles_role_status_idx on public.profiles (role, status);

create index appointment_notes_created_by_idx on public.appointment_notes (created_by);
create index appointments_created_by_idx on public.appointments (created_by);
create index patient_files_uploaded_by_idx on public.patient_files (uploaded_by);
create index patients_created_by_idx on public.patients (created_by);
create index payments_created_by_idx on public.payments (created_by);

create or replace function private.current_role()
returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role
  from public.profiles
  where id = (select auth.uid())
    and status = 'approved'
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.current_role()) = 'admin'::public.app_role
$$;

revoke all on function private.current_role() from public;
revoke all on function private.is_admin() from public;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_admin() to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

revoke insert, update, delete on public.profiles from authenticated;

