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
  if coalesce((select private.current_role())::text, '') not in ('admin', 'receptionist') then raise exception 'forbidden' using errcode = '42501'; end if;
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
  if coalesce((select private.current_role())::text, '') <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
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
  if coalesce((select private.current_role())::text, '') <> 'admin' then raise exception 'forbidden' using errcode = '42501'; end if;
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
