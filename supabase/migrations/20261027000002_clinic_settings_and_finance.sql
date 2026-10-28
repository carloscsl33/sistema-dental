-- Configuración clínica, catálogo de atención y cobros atómicos.
-- La configuración aplica a las citas nuevas o modificadas; nunca reescribe el historial.

create table if not exists public.clinic_settings (
  id boolean primary key default true check (id),
  clinic_name text not null default 'Thera-dent' check (char_length(btrim(clinic_name)) between 1 and 120),
  responsible_name text not null default '' check (char_length(responsible_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 30),
  email text not null default '' check (char_length(email) <= 254),
  address text not null default '' check (char_length(address) <= 250),
  timezone text not null default 'America/Mexico_City',
  currency_code text not null default 'MXN' check (currency_code ~ '^[A-Z]{3}$'),
  slot_minutes smallint not null default 30 check (slot_minutes in (15, 20, 30, 45, 60)),
  slot_capacity smallint not null default 3 check (slot_capacity between 1 and 12),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.clinic_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.business_hours (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  opens_at time without time zone,
  closes_at time without time zone,
  break_starts_at time without time zone,
  break_ends_at time without time zone,
  check ((not is_open) or (opens_at is not null and closes_at is not null and opens_at < closes_at)),
  check (break_starts_at is null or (break_ends_at is not null and opens_at < break_starts_at and break_starts_at < break_ends_at and break_ends_at < closes_at))
);

insert into public.business_hours (day_of_week, is_open, opens_at, closes_at)
values
  (0, true, '09:00', '19:00'), (1, true, '09:00', '19:00'),
  (2, true, '09:00', '19:00'), (3, true, '09:00', '19:00'),
  (4, true, '09:00', '19:00'), (5, true, '09:00', '19:00'),
  (6, true, '09:00', '19:00')
on conflict (day_of_week) do nothing;

create table if not exists public.clinic_closures (
  closed_on date primary key,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);

create table if not exists public.appointment_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 32),
  default_amount numeric(10,2) not null default 0 check (default_amount between 0 and 1000000),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

insert into public.appointment_reasons (name, sort_order) values
  ('Control de brackets', 10), ('Endodoncia', 20), ('Estética dental', 30),
  ('Limpieza dental', 40), ('Valoración', 50), ('Dolor / urgencia', 60), ('Extracción', 70)
on conflict (name) do nothing;

create table if not exists public.treatment_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

insert into public.treatment_catalog (name, sort_order) values
  ('Ortodoncia / Brackets', 10), ('Limpieza dental', 20), ('Extracción / Cirugía', 30),
  ('Endodoncia', 40), ('Valoración inicial', 50)
on conflict (name) do nothing;

create trigger clinic_settings_touch before update on public.clinic_settings
  for each row execute function public.touch_updated_at();
create trigger appointment_reasons_touch before update on public.appointment_reasons
  for each row execute function public.touch_updated_at();
create trigger treatment_catalog_touch before update on public.treatment_catalog
  for each row execute function public.touch_updated_at();

alter table public.clinic_settings enable row level security;
alter table public.business_hours enable row level security;
alter table public.clinic_closures enable row level security;
alter table public.appointment_reasons enable row level security;
alter table public.treatment_catalog enable row level security;

revoke all on public.clinic_settings, public.business_hours, public.clinic_closures, public.appointment_reasons, public.treatment_catalog from anon, authenticated;
grant select on public.clinic_settings, public.business_hours, public.clinic_closures, public.appointment_reasons, public.treatment_catalog to authenticated;
grant insert, update, delete on public.clinic_settings, public.business_hours, public.clinic_closures, public.appointment_reasons, public.treatment_catalog to authenticated;

create policy clinic_settings_read on public.clinic_settings for select to authenticated using ((select private.is_approved()));
create policy clinic_settings_admin_write on public.clinic_settings for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy business_hours_read on public.business_hours for select to authenticated using ((select private.is_approved()));
create policy business_hours_admin_write on public.business_hours for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy clinic_closures_read on public.clinic_closures for select to authenticated using ((select private.is_approved()));
create policy clinic_closures_admin_write on public.clinic_closures for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy appointment_reasons_read on public.appointment_reasons for select to authenticated using ((select private.is_approved()));
create policy appointment_reasons_admin_write on public.appointment_reasons for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy treatment_catalog_read on public.treatment_catalog for select to authenticated using ((select private.is_approved()));
create policy treatment_catalog_admin_write on public.treatment_catalog for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.appointments drop constraint if exists appointments_appt_time_check;
alter table public.blocked_slots drop constraint if exists blocked_slots_places_check;
alter table public.blocked_slots add constraint blocked_slots_places_check check (places between 1 and 12);

create or replace function public.enforce_slot_capacity() returns trigger language plpgsql set search_path = '' as $$
declare
  capacity int; interval_minutes int; clinic_tz text; day_hours public.business_hours; used int; blocked int;
  today date; minutes_from_open int;
begin
  if new.status = 'cancelada' then return new; end if;
  select slot_capacity, slot_minutes, timezone into capacity, interval_minutes, clinic_tz from public.clinic_settings where id = true;
  today := (now() at time zone clinic_tz)::date;
  if (tg_op = 'INSERT' or new.appt_date is distinct from old.appt_date or new.appt_time is distinct from old.appt_time) and new.appt_date < today then
    raise exception 'past_date' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.clinic_closures where closed_on = new.appt_date) then raise exception 'closed_day' using errcode = 'P0001'; end if;
  select * into day_hours from public.business_hours where day_of_week = extract(dow from new.appt_date)::smallint;
  if not found or not day_hours.is_open or new.appt_time < day_hours.opens_at or new.appt_time > day_hours.closes_at
     or (day_hours.break_starts_at is not null and new.appt_time >= day_hours.break_starts_at and new.appt_time < day_hours.break_ends_at) then
    raise exception 'outside_business_hours' using errcode = 'P0001';
  end if;
  minutes_from_open := extract(epoch from (new.appt_time - day_hours.opens_at))::int / 60;
  if minutes_from_open % interval_minutes <> 0 then raise exception 'invalid_slot_interval' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.appt_date::text || ' ' || new.appt_time::text, 0));
  select count(*) into used from public.appointments where appt_date = new.appt_date and appt_time = new.appt_time and status <> 'cancelada' and id <> new.id;
  select coalesce(sum(places), 0) into blocked from public.blocked_slots where slot_date = new.appt_date and slot_time = new.appt_time;
  if used + blocked >= capacity then raise exception 'slot_full' using errcode = 'P0001'; end if;
  return new;
end $$;

create or replace function public.enforce_blocked_slot_capacity() returns trigger language plpgsql set search_path = '' as $$
declare capacity int; used int;
begin
  select slot_capacity into capacity from public.clinic_settings where id = true;
  if new.places > capacity then raise exception 'invalid_block_count' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.slot_date::text || ' ' || new.slot_time::text, 0));
  select count(*) into used from public.appointments where appt_date = new.slot_date and appt_time = new.slot_time and status <> 'cancelada';
  if used + new.places > capacity then raise exception 'slot_full' using errcode = 'P0001'; end if;
  return new;
end $$;

-- Los pagos solo se crean desde esta transacción, nunca directamente desde el navegador.
drop policy if exists payments_insert on public.payments;
revoke insert, update, delete on public.payments from authenticated;
revoke update (paid) on public.appointments from authenticated;

create or replace function private.register_payment(
  p_appointment_id uuid, p_amount numeric, p_method text,
  p_paid_on date default null, p_reference text default null, p_notes text default null,
  p_finalize boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  cur public.appointments; rec record; remaining numeric(10,2); pending numeric(10,2); applied numeric(10,2); day date;
begin
  if (select private.current_role()) not in ('admin'::public.app_role, 'receptionist'::public.app_role) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if p_method not in ('Efectivo', 'Tarjeta', 'Transferencia') then raise exception 'invalid_method' using errcode = 'P0001'; end if;
  day := coalesce(p_paid_on, (now() at time zone (select timezone from public.clinic_settings where id = true))::date);
  perform 1 from public.appointments where patient_id = (select patient_id from public.appointments where id = p_appointment_id) and status <> 'cancelada' order by id for update;
  select * into cur from public.appointments where id = p_appointment_id and status <> 'cancelada';
  if not found then raise exception 'appointment_not_found' using errcode = 'P0001'; end if;
  select coalesce(sum(total - paid), 0) into pending from public.appointments where patient_id = cur.patient_id and status <> 'cancelada';
  if p_amount > pending then raise exception 'overpayment' using errcode = 'P0001'; end if;
  remaining := round(p_amount, 2);
  for rec in select id, motive, total, paid from public.appointments where patient_id = cur.patient_id and status <> 'cancelada' and total > paid order by (id = cur.id) desc, appt_date, appt_time loop
    exit when remaining <= 0;
    applied := least(rec.total - rec.paid, remaining);
    update public.appointments set paid = paid + applied where id = rec.id;
    insert into public.payments (patient_id, appointment_id, amount, method, paid_on, concept, reference, notes, created_by)
      values (cur.patient_id, rec.id, applied, p_method, day, rec.motive, nullif(left(coalesce(p_reference, ''), 80), ''), nullif(left(coalesce(p_notes, ''), 500), ''), (select auth.uid()));
    remaining := remaining - applied;
  end loop;
  if p_finalize then update public.appointments set status = 'finalizada' where id = cur.id; end if;
  return jsonb_build_object('received', p_amount, 'pending_after', pending - p_amount);
end $$;

create or replace function public.record_payment(
  p_appointment_id uuid, p_amount numeric, p_method text,
  p_paid_on date default null, p_reference text default null, p_notes text default null,
  p_finalize boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.register_payment(p_appointment_id, p_amount, p_method, p_paid_on, p_reference, p_notes, p_finalize);
end $$;

revoke all on function public.record_payment(uuid, numeric, text, date, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, numeric, text, date, text, text, boolean) to authenticated;
