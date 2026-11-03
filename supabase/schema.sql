-- Halı Saha Kadro — Supabase şeması (cloud açılınca apply_migration ile)
-- Anonim oy: voter→candidate kaydı yok; sadece cast bayrağı + aggregate sayaç.

create extension if not exists "pgcrypto";

create table if not exists hs_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_editor boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists hs_people (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  photo_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists hs_matches (
  id uuid primary key default gen_random_uuid(),
  match_date date not null unique,
  player_count int not null check (player_count in (6,7,8)),
  team_a jsonb not null,
  team_b jsonb not null,
  score_a int,
  score_b int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who already voted (no candidate stored)
create table if not exists hs_vote_casts (
  match_id uuid not null references hs_matches(id) on delete cascade,
  voter_key text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, voter_key)
);

-- Aggregate-only tallies
create table if not exists hs_vote_counts (
  match_id uuid not null references hs_matches(id) on delete cascade,
  player_id uuid not null,
  votes int not null default 0 check (votes >= 0),
  primary key (match_id, player_id)
);

alter table hs_profiles enable row level security;
alter table hs_people enable row level security;
alter table hs_matches enable row level security;
alter table hs_vote_casts enable row level security;
alter table hs_vote_counts enable row level security;

-- Public read matches/people/counts; editors write
create policy "matches_read" on hs_matches for select using (true);
create policy "people_read" on hs_people for select using (true);
create policy "counts_read" on hs_vote_counts for select using (true);

create policy "matches_write_editor" on hs_matches for all using (
  exists (select 1 from hs_profiles p where p.id = auth.uid() and p.is_editor)
) with check (
  exists (select 1 from hs_profiles p where p.id = auth.uid() and p.is_editor)
);

create policy "people_write_editor" on hs_people for all using (
  exists (select 1 from hs_profiles p where p.id = auth.uid() and p.is_editor)
) with check (
  exists (select 1 from hs_profiles p where p.id = auth.uid() and p.is_editor)
);

-- Vote cast: insert only own voter_key once; no select of others' mapping needed
create policy "casts_insert_self" on hs_vote_casts for insert with check (true);
create policy "casts_select_own" on hs_vote_casts for select using (true);

-- Increment votes via secure function (never writes voter→candidate)
create or replace function hs_cast_vote(
  p_match_id uuid,
  p_voter_key text,
  p_candidate_id uuid,
  p_self_player_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_self_player_id is not null and p_self_player_id = p_candidate_id then
    raise exception 'self_vote_forbidden';
  end if;
  insert into hs_vote_casts(match_id, voter_key) values (p_match_id, p_voter_key);
  insert into hs_vote_counts(match_id, player_id, votes)
  values (p_match_id, p_candidate_id, 1)
  on conflict (match_id, player_id)
  do update set votes = hs_vote_counts.votes + 1;
exception
  when unique_violation then
    raise exception 'already_voted';
end;
$$;

revoke all on function hs_cast_vote from public;
grant execute on function hs_cast_vote to anon, authenticated;
