-- Run this once in the Supabase SQL Editor after replacing both example emails below.
-- Use the same email addresses the two people will use to create their accounts.
begin;

create table if not exists public.music_members (
  email text primary key check (email = lower(email))
);

alter table public.music_members enable row level security;
revoke all on table public.music_members from anon, authenticated;
grant select on table public.music_members to authenticated;
drop policy if exists "Members can read their own allowlist entry" on public.music_members;
create policy "Members can read their own allowlist entry"
  on public.music_members for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

-- Replace these two examples before running the script.
insert into public.music_members (email) values
  ('you@example.com'),
  ('friend@example.com')
on conflict (email) do nothing;

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text not null,
  file_path text not null unique,
  original_filename text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 83886080),
  mime_type text not null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.music_tracks enable row level security;
revoke all on table public.music_tracks from anon, authenticated;
grant select, insert, delete on table public.music_tracks to authenticated;
drop policy if exists "Approved members can read tracks" on public.music_tracks;
drop policy if exists "Approved members can add their own tracks" on public.music_tracks;
drop policy if exists "Approved members can remove their own tracks" on public.music_tracks;
create policy "Approved members can read tracks"
  on public.music_tracks for select to authenticated
  using (exists (
    select 1 from public.music_members m
    where m.email = lower((select auth.jwt() ->> 'email'))
  ));
create policy "Approved members can add their own tracks"
  on public.music_tracks for insert to authenticated
  with check (
    uploaded_by = (select auth.uid()) and exists (
      select 1 from public.music_members m
      where m.email = lower((select auth.jwt() ->> 'email'))
    )
  );
create policy "Approved members can remove their own tracks"
  on public.music_tracks for delete to authenticated
  using (
    uploaded_by = (select auth.uid()) and exists (
      select 1 from public.music_members m
      where m.email = lower((select auth.jwt() ->> 'email'))
    )
  );

-- Private bucket: only approved accounts can read, and uploads stay in each uploader's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crazy-batto-music', 'crazy-batto-music', false, 83886080, null)
on conflict (id) do nothing;
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'crazy-batto-music' and public = false and file_size_limit >= 83886080
  ) then
    raise exception 'The crazy-batto-music bucket already exists with unsafe settings. Check it in Storage before continuing.';
  end if;
end $$;

drop policy if exists "Approved members can listen to music" on storage.objects;
drop policy if exists "Approved members can upload their own music" on storage.objects;
drop policy if exists "Approved members can remove their own music" on storage.objects;
create policy "Approved members can listen to music"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'crazy-batto-music' and exists (
      select 1 from public.music_members m
      where m.email = lower((select auth.jwt() ->> 'email'))
    )
  );
create policy "Approved members can upload their own music"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'crazy-batto-music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and lower(name) ~ '\.(mp3|m4a|aac|ogg|wav|flac)$'
    and exists (
      select 1 from public.music_members m
      where m.email = lower((select auth.jwt() ->> 'email'))
    )
  );
create policy "Approved members can remove their own music"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'crazy-batto-music'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1 from public.music_members m
      where m.email = lower((select auth.jwt() ->> 'email'))
    )
  );

commit;

