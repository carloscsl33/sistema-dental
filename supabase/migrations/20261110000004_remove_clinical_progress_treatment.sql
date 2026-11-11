create or replace function public.set_clinical_progress_author() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' and current_setting('theradent.restore_mode', true) is distinct from 'on' then
    new.author_id := auth.uid();
    select coalesce(nullif(btrim(p.full_name), ''), u.email, '') into new.author_name
    from auth.users u left join public.profiles p on p.id = u.id
    where u.id = auth.uid();
  end if;
  new.updated_at := now();
  return new;
end
$$;

alter table public.clinical_progress drop column if exists treatment_name;

revoke insert, update on public.clinical_progress from authenticated;
grant insert (patient_id, body) on public.clinical_progress to authenticated;
grant update (body) on public.clinical_progress to authenticated;

update public.clinical_progress cp
set author_name = coalesce(nullif(btrim(p.full_name), ''), u.email, '')
from auth.users u left join public.profiles p on p.id = u.id
where cp.author_id = u.id;
