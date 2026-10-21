-- =====================================================================
-- Sistema Dental · esquema Supabase (PostgreSQL 15+)
-- Ejecutar COMPLETO una sola vez en: Supabase > SQL Editor.
-- Antes: Authentication > Providers > Email > desactivar "Allow new users to sign up"
-- (los usuarios se crean con "Invite user"; así nadie ajeno puede registrarse).
-- Todos los usuarios invitados tienen los mismos permisos.
-- =====================================================================
create schema if not exists extensions;
create schema if not exists private;
revoke all on schema private from public;
create extension if not exists pg_trgm with schema extensions;

create type public.profile_status as enum ('pending', 'approved', 'blocked');
create type public.appt_status    as enum ('en_espera', 'finalizada', 'cancelada');

-- ---------- Perfiles y acceso ----------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  status      public.profile_status not null default 'approved',
  created_at  timestamptz not null default now(),
  approved_at timestamptz default now()
);

create function private.is_approved() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and status = 'approved');
$$;

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Solo existen usuarios invitados (registro público desactivado), por eso nacen aprobados.
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email, ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- Pacientes ----------
create table public.patients (
  id                 uuid primary key default gen_random_uuid(),
  first_name         text not null check (char_length(btrim(first_name)) between 1 and 80),
  last_name          text not null check (char_length(btrim(last_name)) between 1 and 120),
  full_name          text generated always as (first_name || ' ' || last_name) stored,
  birth_date         date not null check (birth_date between date '1900-01-01' and date '2100-01-01'),
  sex                text check (sex in ('Femenino', 'Masculino', 'Prefiero no especificar')),
  phone              text not null check (phone ~ '^[0-9]{10}$'),
  email              text check (email is null or email = '' or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  address            text check (char_length(address) <= 250),
  emergency_name     text not null check (char_length(emergency_name) <= 120),
  emergency_relation text not null check (char_length(emergency_relation) <= 60),
  emergency_phone    text not null check (emergency_phone ~ '^[0-9]{10}$'),
  blood_type         text check (blood_type in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  medical_history    text check (char_length(medical_history) <= 2000),
  allergies          text not null check (char_length(allergies) <= 1000),
  medications        text check (char_length(medications) <= 1000),
  medical_notes      text check (char_length(medical_notes) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users (id) on delete set null
);
-- Homónimos permitidos si cambia la fecha de nacimiento
create unique index patients_identity_uq on public.patients (lower(first_name), lower(last_name), birth_date);
create index patients_full_name_trgm on public.patients using gin (full_name extensions.gin_trgm_ops);
create trigger patients_touch before update on public.patients for each row execute function public.touch_updated_at();

create table public.treatments (
  id          uuid primary key default gen_random_uuid(),
  patient_id  uuid not null references public.patients (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  diagnosis   text not null check (char_length(btrim(diagnosis)) between 1 and 500),
  recorded_on date not null default current_date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index treatments_patient_idx on public.treatments (patient_id, recorded_on desc);

-- ---------- Horarios bloqueados ----------
create table public.blocked_slots (
  slot_date date not null,
  slot_time time not null,
  places    int  not null default 1 check (places between 1 and 3),
  primary key (slot_date, slot_time)
);

-- ---------- Citas ----------
create table public.appointments (
  id         uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  appt_date  date not null,
  appt_time  time not null check (appt_time between time '09:00' and time '19:00' and extract(minute from appt_time) in (0, 30)),
  motive     text not null check (char_length(btrim(motive)) between 1 and 32),
  status     public.appt_status not null default 'en_espera',
  total      numeric(10,2) not null default 0 check (total between 0 and 1000000),
  paid       numeric(10,2) not null default 0 check (paid >= 0),
  balance    numeric(10,2) generated always as (total - paid) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint appointments_paid_le_total check (paid <= total)
);
create unique index appointments_patient_day_uq on public.appointments (patient_id, appt_date) where status <> 'cancelada';
create index appointments_day_idx     on public.appointments (appt_date, appt_time);
create index appointments_patient_idx on public.appointments (patient_id, appt_date desc);
create index appointments_pending_idx on public.appointments (patient_id, appt_date, appt_time) where balance > 0 and status <> 'cancelada';
create trigger appointments_touch before update on public.appointments for each row execute function public.touch_updated_at();

-- Máximo 3 pacientes por horario, validado en la base (seguro con varios usuarios a la vez)
create function public.enforce_slot_capacity() returns trigger language plpgsql set search_path = '' as $$
declare
  capacity constant int := 3;
  used int; blocked int;
  today date := (now() at time zone 'America/Mexico_City')::date;
begin
  if new.status = 'cancelada' then return new; end if;
  if tg_op = 'INSERT' or new.appt_date is distinct from old.appt_date or new.appt_time is distinct from old.appt_time then
    if new.appt_date < today then raise exception 'past_date' using errcode = 'P0001'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.appt_date::text || ' ' || new.appt_time::text, 0));
  select count(*) into used from public.appointments
   where appt_date = new.appt_date and appt_time = new.appt_time and status <> 'cancelada' and id <> new.id;
  select coalesce(sum(places), 0) into blocked from public.blocked_slots
   where slot_date = new.appt_date and slot_time = new.appt_time;
  if used + blocked >= capacity then raise exception 'slot_full' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger appointments_capacity before insert or update of appt_date, appt_time, status on public.appointments
  for each row execute function public.enforce_slot_capacity();

create function public.enforce_blocked_slot_capacity() returns trigger
language plpgsql set search_path = '' as $$
declare
  capacity constant int := 3;
  used int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.slot_date::text || ' ' || new.slot_time::text, 0));
  select count(*) into used from public.appointments
   where appt_date = new.slot_date and appt_time = new.slot_time and status <> 'cancelada';
  if used + new.places > capacity then
    raise exception 'slot_full' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger blocked_slots_capacity before insert or update of slot_date, slot_time, places on public.blocked_slots
  for each row execute function public.enforce_blocked_slot_capacity();

create table public.appointment_notes (
  appointment_id uuid primary key references public.appointments (id) on delete cascade,
  body           text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null
);
create trigger notes_touch before update on public.appointment_notes for each row execute function public.touch_updated_at();

-- ---------- Pagos (solo se pueden crear, nunca editar ni borrar: no hay grant de update/delete) ----------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  amount         numeric(10,2) not null check (amount > 0),
  method         text not null check (method in ('Efectivo', 'Tarjeta', 'Transferencia')),
  paid_on        date not null,
  concept        text,
  reference      text check (char_length(reference) <= 80),
  notes          text check (char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null
);
create index payments_patient_idx on public.payments (patient_id, paid_on desc);
create index payments_day_idx     on public.payments (paid_on);
create index payments_appt_idx    on public.payments (appointment_id);

-- Aplica el pago a la cita actual y el resto al saldo más antiguo del paciente. Todo en una transacción.
create function private.register_payment(
  p_appointment_id uuid, p_amount numeric, p_method text,
  p_paid_on date default null, p_reference text default null, p_notes text default null,
  p_finalize boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cur public.appointments; rec record;
  remaining numeric(10,2); pending numeric(10,2); applied numeric(10,2);
  day date := coalesce(p_paid_on, (now() at time zone 'America/Mexico_City')::date);
begin
  if not private.is_approved() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;

  perform 1 from public.appointments
   where patient_id = (select patient_id from public.appointments where id = p_appointment_id)
     and status <> 'cancelada' order by id for update;
  select * into cur from public.appointments where id = p_appointment_id and status <> 'cancelada';
  if not found then raise exception 'appointment_not_found' using errcode = 'P0001'; end if;

  select coalesce(sum(total - paid), 0) into pending from public.appointments
   where patient_id = cur.patient_id and status <> 'cancelada';
  if p_amount > pending then raise exception 'overpayment' using errcode = 'P0001'; end if;

  remaining := round(p_amount, 2);
  for rec in
    select id, motive, total, paid from public.appointments
     where patient_id = cur.patient_id and status <> 'cancelada' and total > paid
     order by (id = cur.id) desc, appt_date, appt_time
  loop
    exit when remaining <= 0;
    applied := least(rec.total - rec.paid, remaining);
    update public.appointments set paid = paid + applied where id = rec.id;
    insert into public.payments (patient_id, appointment_id, amount, method, paid_on, concept, reference, notes, created_by)
    values (cur.patient_id, rec.id, applied, p_method, day, rec.motive, p_reference, p_notes, (select auth.uid()));
    remaining := remaining - applied;
  end loop;

  if p_finalize then update public.appointments set status = 'finalizada' where id = cur.id; end if;
  return jsonb_build_object('received', p_amount, 'pending_after', pending - p_amount);
end $$;

-- ---------- Archivos clínicos (metadatos; el archivo vive en Storage privado) ----------
create table public.patient_files (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null check (char_length(file_name) <= 200),
  mime_type    text not null check (mime_type in ('image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes   int  not null check (size_bytes between 1 and 10485760),
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid default auth.uid() references auth.users (id) on delete set null
);
create index patient_files_patient_idx on public.patient_files (patient_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clinical-files', 'clinical-files', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy clinical_files_select on storage.objects for select to authenticated using (bucket_id = 'clinical-files' and (select private.is_approved()));
create policy clinical_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'clinical-files' and (select private.is_approved()));
create policy clinical_files_delete on storage.objects for delete to authenticated using (bucket_id = 'clinical-files' and (select private.is_approved()));

-- ---------- Bitácora de auditoría ----------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  row_id     text,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);
create function public.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (user_id, table_name, row_id, action, old_data, new_data)
  values ((select auth.uid()), tg_table_name, coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return null;
end $$;
create trigger patients_audit     after insert or update or delete on public.patients     for each row execute function public.audit_row();
create trigger appointments_audit after insert or update or delete on public.appointments for each row execute function public.audit_row();
create trigger payments_audit     after insert or update or delete on public.payments     for each row execute function public.audit_row();

-- ---------- Resumen del tablero (una consulta en vez de cargar todo) ----------
create function public.dashboard_summary(p_day date) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'appointments', (select count(*) from public.appointments where appt_date = p_day and status <> 'cancelada'),
    'attended',     (select count(*) from public.appointments where appt_date = p_day and status = 'finalizada'),
    'income',       (select coalesce(sum(amount), 0) from public.payments where paid_on = p_day));
$$;

-- ---------- Seguridad: RLS + permisos mínimos ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_approved() to authenticated;
grant execute on function public.dashboard_summary(date) to authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','patients','treatments','blocked_slots','appointments','appointment_notes','payments','patient_files','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array array['patients','treatments','blocked_slots','appointments','appointment_notes','payments','patient_files'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_approved()))', t || '_select', t);
  end loop;
  foreach t in array array['patients','treatments','blocked_slots','appointments','appointment_notes'] loop
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_approved()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_approved())) with check ((select private.is_approved()))', t || '_update', t);
  end loop;
  foreach t in array array['treatments','blocked_slots','appointment_notes','patient_files'] loop
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_approved()))', t || '_delete', t);
  end loop;
end $$;
create policy patient_files_insert on public.patient_files for insert to authenticated with check ((select private.is_approved()));
create policy patients_delete      on public.patients      for delete to authenticated using ((select private.is_approved()));
create policy appointments_delete  on public.appointments  for delete to authenticated using ((select private.is_approved()) and status <> 'finalizada');
create policy profiles_select      on public.profiles      for select to authenticated using (id = (select auth.uid()));
create policy audit_select         on public.audit_log     for select to authenticated using ((select private.is_approved()));
create policy payments_insert      on public.payments      for insert to authenticated with check ((select private.is_approved()));

grant select on public.profiles, public.patients, public.treatments, public.blocked_slots, public.appointments,
                public.appointment_notes, public.payments, public.patient_files to authenticated;
grant select on public.audit_log to authenticated;
grant insert, update, delete on public.patients, public.treatments, public.blocked_slots, public.appointment_notes to authenticated;
grant insert (id, patient_id, appt_date, appt_time, motive, total, paid, status) on public.appointments to authenticated;
grant update (patient_id, appt_date, appt_time, motive, total, status, paid) on public.appointments to authenticated;
grant delete on public.appointments, public.patient_files to authenticated;
grant insert on public.patient_files to authenticated;
grant insert (id, patient_id, appointment_id, amount, method, paid_on, concept, reference, notes) on public.payments to authenticated;

-- Tiempo real para que 3-4 personas vean los cambios al instante (respeta RLS)
alter publication supabase_realtime add table public.patients, public.treatments, public.blocked_slots,
  public.appointments, public.appointment_notes, public.payments, public.patient_files;

-- ---------- Quitar acceso a alguien ----------
-- update public.profiles set status = 'blocked' where id = (select id from auth.users where email = 'correo@ejemplo.com');
