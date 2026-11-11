create table if not exists public.clinical_progress (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  progress_on date not null default (now() at time zone 'America/Mexico_City')::date,
  treatment_name text check (char_length(treatment_name) <= 160),
  author_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_progress_patient_created_idx on public.clinical_progress(patient_id, created_at desc);

create or replace function public.set_clinical_progress_author() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' and current_setting('theradent.restore_mode', true) is distinct from 'on' then
    new.author_id := auth.uid();
    select full_name into new.author_name from public.profiles where id = auth.uid();
    new.author_name := coalesce(new.author_name, '');
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists clinical_progress_author on public.clinical_progress;
create trigger clinical_progress_author before insert or update on public.clinical_progress for each row execute function public.set_clinical_progress_author();
revoke all on function public.set_clinical_progress_author() from public;
revoke execute on function public.set_clinical_progress_author() from anon, authenticated;
alter table public.clinical_progress enable row level security;
revoke all on public.clinical_progress from anon;
revoke insert, update on public.clinical_progress from authenticated;
grant select, delete on public.clinical_progress to authenticated;
grant insert (patient_id, body, progress_on, treatment_name) on public.clinical_progress to authenticated;
grant update (body, progress_on, treatment_name) on public.clinical_progress to authenticated;

create policy clinical_progress_select on public.clinical_progress for select to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_progress_insert on public.clinical_progress for insert to authenticated with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_progress_update on public.clinical_progress for update to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role)) with check ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));
create policy clinical_progress_delete on public.clinical_progress for delete to authenticated using ((select private.current_role()) in ('admin'::public.app_role, 'doctor'::public.app_role));

alter table public.clinical_progress replica identity full;
do $$ begin alter publication supabase_realtime add table public.clinical_progress; exception when duplicate_object then null; end $$;
