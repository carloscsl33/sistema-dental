-- Conserva una fotografía financiera por pago y permite tratamientos sin diagnóstico.
alter table public.payments
  add column if not exists appointment_date date,
  add column if not exists appointment_time time,
  add column if not exists appointment_total numeric(10,2),
  add column if not exists balance_after numeric(10,2);

alter table public.payments
  drop constraint if exists payments_appointment_total_check,
  drop constraint if exists payments_balance_after_check;

alter table public.payments
  add constraint payments_appointment_total_check check (appointment_total is null or appointment_total >= 0),
  add constraint payments_balance_after_check check (balance_after is null or balance_after >= 0);

with running as (
  select p.id,
    a.appt_date,
    a.appt_time,
    a.total,
    greatest(a.total - sum(p.amount) over (
      partition by p.appointment_id
      order by p.paid_on, p.created_at, p.id
      rows between unbounded preceding and current row
    ), 0) as remaining
  from public.payments p
  left join public.appointments a on a.id = p.appointment_id
)
update public.payments p
set appointment_date = coalesce(p.appointment_date, running.appt_date),
    appointment_time = coalesce(p.appointment_time, running.appt_time),
    appointment_total = coalesce(p.appointment_total, running.total),
    balance_after = coalesce(p.balance_after, running.remaining)
from running
where p.id = running.id;

alter table public.treatments alter column diagnosis drop not null;
alter table public.treatments drop constraint if exists treatments_diagnosis_check;
alter table public.treatments add constraint treatments_diagnosis_check
  check (diagnosis is null or char_length(btrim(diagnosis)) <= 500);

create or replace function private.register_payment(
  p_appointment_id uuid, p_amount numeric, p_method text,
  p_paid_on date default null, p_reference text default null, p_notes text default null,
  p_finalize boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  for rec in select id, motive, appt_date, appt_time, total, paid from public.appointments where patient_id = cur.patient_id and status <> 'cancelada' and total > paid order by (id = cur.id) desc, appt_date, appt_time loop
    exit when remaining <= 0;
    applied := least(rec.total - rec.paid, remaining);
    update public.appointments set paid = paid + applied where id = rec.id;
    insert into public.payments (patient_id, appointment_id, amount, method, paid_on, concept, reference, notes, appointment_date, appointment_time, appointment_total, balance_after, created_by)
      values (cur.patient_id, rec.id, applied, p_method, day, rec.motive, nullif(left(coalesce(p_reference, ''), 80), ''), nullif(left(coalesce(p_notes, ''), 500), ''), rec.appt_date, rec.appt_time, rec.total, rec.total - rec.paid - applied, (select auth.uid()));
    remaining := remaining - applied;
  end loop;
  if p_finalize then update public.appointments set status = 'finalizada' where id = cur.id; end if;
  return jsonb_build_object('received', p_amount, 'pending_after', pending - p_amount);
end $$;

grant insert (id, patient_id, appointment_id, amount, method, paid_on, concept, reference, notes, appointment_date, appointment_time, appointment_total, balance_after) on public.payments to authenticated;
