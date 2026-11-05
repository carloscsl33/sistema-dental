-- Finanzas: gastos y devoluciones inmutables; las escrituras críticas se realizan mediante RPC.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  spent_on date not null,
  amount numeric(10,2) not null check (amount > 0 and amount <= 1000000),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  method text check (method is null or method in ('Efectivo', 'Tarjeta', 'Transferencia')),
  vendor text check (vendor is null or char_length(vendor) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists expenses_spent_on_idx on public.expenses (spent_on desc);

create table if not exists public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  patient_id uuid not null references public.patients(id) on delete restrict,
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  amount numeric(10,2) not null check (amount > 0),
  refunded_on date not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists payment_refunds_paid_on_idx on public.payment_refunds (refunded_on desc);
create index if not exists payment_refunds_payment_idx on public.payment_refunds (payment_id);

alter table public.expenses enable row level security;
alter table public.payment_refunds enable row level security;
revoke all on public.expenses, public.payment_refunds from anon, authenticated;
grant select on public.expenses, public.payment_refunds to authenticated;
create policy expenses_read_finance on public.expenses for select to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));
create policy payment_refunds_read_finance on public.payment_refunds for select to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'receptionist'::public.app_role));

create or replace function public.record_payment(
  p_appointment_id uuid, p_amount numeric, p_method text,
  p_paid_on date default null, p_reference text default null, p_notes text default null,
  p_finalize boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return private.register_payment(p_appointment_id, p_amount, p_method, p_paid_on, p_reference, p_notes, p_finalize);
end $$;

create or replace function public.record_expense(
  p_spent_on date, p_amount numeric, p_category text, p_method text default null,
  p_vendor text default null, p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if (select private.current_role()) <> 'admin'::public.app_role then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_spent_on is null or p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid_amount' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p_category, '')), '') is null then raise exception 'invalid_category' using errcode = 'P0001'; end if;
  if p_method is not null and p_method not in ('Efectivo', 'Tarjeta', 'Transferencia') then raise exception 'invalid_method' using errcode = 'P0001'; end if;
  insert into public.expenses (spent_on, amount, category, method, vendor, notes, created_by)
    values (p_spent_on, round(p_amount, 2), left(btrim(p_category), 80), p_method, nullif(left(btrim(coalesce(p_vendor, '')), 120), ''), nullif(left(btrim(coalesce(p_notes, '')), 500), ''), (select auth.uid()))
    returning id into new_id;
  return new_id;
end $$;

create or replace function public.record_payment_refund(
  p_payment_id uuid, p_amount numeric, p_refunded_on date, p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare payment_row public.payments; already_refunded numeric(10,2); new_id uuid;
begin
  if (select private.current_role()) <> 'admin'::public.app_role then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_refunded_on is null or nullif(btrim(coalesce(p_reason, '')), '') is null then raise exception 'invalid_refund' using errcode = 'P0001'; end if;
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found or payment_row.appointment_id is null then raise exception 'payment_not_found' using errcode = 'P0001'; end if;
  perform 1 from public.appointments where id = payment_row.appointment_id for update;
  select coalesce(sum(amount), 0) into already_refunded from public.payment_refunds where payment_id = p_payment_id;
  if p_amount > payment_row.amount - already_refunded then raise exception 'refund_exceeds_payment' using errcode = 'P0001'; end if;
  update public.appointments set paid = greatest(paid - round(p_amount, 2), 0), status = case when status = 'finalizada' then 'en_espera'::public.appt_status else status end where id = payment_row.appointment_id;
  insert into public.payment_refunds (payment_id, patient_id, appointment_id, amount, refunded_on, reason, created_by)
    values (payment_row.id, payment_row.patient_id, payment_row.appointment_id, round(p_amount, 2), p_refunded_on, left(btrim(p_reason), 500), (select auth.uid()))
    returning id into new_id;
  return new_id;
end $$;

revoke all on function public.record_payment(uuid, numeric, text, date, text, text, boolean) from public, anon;
revoke all on function public.record_expense(date, numeric, text, text, text, text) from public, anon;
revoke all on function public.record_payment_refund(uuid, numeric, date, text) from public, anon;
grant execute on function public.record_payment(uuid, numeric, text, date, text, text, boolean) to authenticated;
grant execute on function public.record_expense(date, numeric, text, text, text, text) to authenticated;
grant execute on function public.record_payment_refund(uuid, numeric, date, text) to authenticated;

create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function public.audit_row();
create trigger payment_refunds_audit after insert or update or delete on public.payment_refunds for each row execute function public.audit_row();
alter publication supabase_realtime add table public.expenses, public.payment_refunds;

create or replace function public.restore_theradent_backup(p_backup jsonb) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_backup->>'format' <> 'theradent-backup' or (p_backup->>'version')::int <> 1 or p_backup->'tables' is null then raise exception 'invalid_backup' using errcode = 'P0001'; end if;
  perform set_config('theradent.restore_mode', 'on', true);
  delete from public.payment_refunds; delete from public.payments; delete from public.expenses; delete from public.appointment_notes; delete from public.appointments; delete from public.patient_qr_tokens; delete from public.patient_files; delete from public.treatments; delete from public.patient_clinical_records; delete from public.patients; delete from public.blocked_slots; delete from public.clinic_closures; delete from public.business_hours; delete from public.appointment_reasons; delete from public.treatment_catalog; delete from public.clinic_settings;
  insert into public.clinic_settings select * from jsonb_populate_recordset(null::public.clinic_settings, coalesce(p_backup #> '{tables,clinic_settings}', '[]'::jsonb));
  insert into public.business_hours select * from jsonb_populate_recordset(null::public.business_hours, coalesce(p_backup #> '{tables,business_hours}', '[]'::jsonb));
  insert into public.clinic_closures select * from jsonb_populate_recordset(null::public.clinic_closures, coalesce(p_backup #> '{tables,clinic_closures}', '[]'::jsonb));
  insert into public.appointment_reasons select * from jsonb_populate_recordset(null::public.appointment_reasons, coalesce(p_backup #> '{tables,appointment_reasons}', '[]'::jsonb));
  insert into public.treatment_catalog select * from jsonb_populate_recordset(null::public.treatment_catalog, coalesce(p_backup #> '{tables,treatment_catalog}', '[]'::jsonb));
  insert into public.patients (id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, blood_type, medical_history, allergies, medications, medical_notes, created_at, updated_at, created_by) select id, first_name, last_name, birth_date, sex, phone, email, address, emergency_name, emergency_relation, emergency_phone, blood_type, medical_history, allergies, medications, medical_notes, created_at, updated_at, created_by from jsonb_populate_recordset(null::public.patients, coalesce(p_backup #> '{tables,patients}', '[]'::jsonb));
  insert into public.patient_clinical_records select * from jsonb_populate_recordset(null::public.patient_clinical_records, coalesce(p_backup #> '{tables,patient_clinical_records}', '[]'::jsonb));
  insert into public.treatments select * from jsonb_populate_recordset(null::public.treatments, coalesce(p_backup #> '{tables,treatments}', '[]'::jsonb));
  insert into public.patient_files select * from jsonb_populate_recordset(null::public.patient_files, coalesce(p_backup #> '{tables,patient_files}', '[]'::jsonb));
  insert into public.appointments (id, patient_id, appt_date, appt_time, motive, status, total, paid, created_at, updated_at, created_by) select id, patient_id, appt_date, appt_time, motive, status, total, paid, created_at, updated_at, created_by from jsonb_populate_recordset(null::public.appointments, coalesce(p_backup #> '{tables,appointments}', '[]'::jsonb));
  insert into public.appointment_notes select * from jsonb_populate_recordset(null::public.appointment_notes, coalesce(p_backup #> '{tables,appointment_notes}', '[]'::jsonb));
  insert into public.payments select * from jsonb_populate_recordset(null::public.payments, coalesce(p_backup #> '{tables,payments}', '[]'::jsonb));
  insert into public.payment_refunds select * from jsonb_populate_recordset(null::public.payment_refunds, coalesce(p_backup #> '{tables,payment_refunds}', '[]'::jsonb));
  insert into public.expenses select * from jsonb_populate_recordset(null::public.expenses, coalesce(p_backup #> '{tables,expenses}', '[]'::jsonb));
  insert into public.blocked_slots select * from jsonb_populate_recordset(null::public.blocked_slots, coalesce(p_backup #> '{tables,blocked_slots}', '[]'::jsonb));
  insert into public.patient_qr_tokens select * from jsonb_populate_recordset(null::public.patient_qr_tokens, coalesce(p_backup #> '{tables,patient_qr_tokens}', '[]'::jsonb));
end $$;

revoke all on function public.restore_theradent_backup(jsonb) from public, anon, authenticated;
grant execute on function public.restore_theradent_backup(jsonb) to service_role;
