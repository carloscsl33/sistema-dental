create table if not exists public.google_drive_connection (
  id boolean primary key default true check (id),
  folder_id text not null check (char_length(folder_id) between 1 and 220),
  account_email text,
  token_ciphertext text not null,
  token_iv text not null,
  connected_at timestamptz not null default now(),
  connected_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

alter table public.google_drive_connection enable row level security;

create table if not exists public.google_drive_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.google_drive_oauth_states enable row level security;

create or replace function public.touch_google_drive_connection_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists google_drive_connection_touch on public.google_drive_connection;
create trigger google_drive_connection_touch
before update on public.google_drive_connection
for each row execute function public.touch_google_drive_connection_updated_at();
