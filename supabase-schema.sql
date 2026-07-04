-- =====================================================================
-- ArcanaForge — Shared Campaign Schema (v4, consolidated)
-- Includes: campaigns/members/notes/inventory/sheets + shared_docs
-- (GM-only 'gm:' docs) + campaign_rolls (shared Game Log, hidden rolls).
-- Paste this entire file into Supabase → SQL Editor → Run.
-- Safe to re-run: it drops and recreates everything it owns.
-- =====================================================================

-- ---------- tables ----------
drop table if exists campaign_rolls cascade;
drop table if exists shared_docs cascade;
drop table if exists character_sheets cascade;
drop table if exists inventory_items cascade;
drop table if exists campaign_notes cascade;
drop table if exists campaign_members cascade;
drop table if exists campaigns cascade;

create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  join_code   text unique not null,
  name        text not null,
  gm_id       uuid not null,
  created_at  timestamptz default now()
);

create table campaign_members (
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  user_id      uuid not null,
  display_name text not null,
  role         text not null check (role in ('gm','player')),
  joined_at    timestamptz default now(),
  primary key (campaign_id, user_id)
);

create table campaign_notes (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  author_id   uuid not null,
  author_name text,
  title       text default '',
  body        text default '',
  visibility  text not null default 'party' check (visibility in ('party','dm')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table inventory_items (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  name        text not null,
  qty         integer not null default 1,
  carrier     text default '',
  value       text default '',
  notes       text default '',
  updated_by  text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create table character_sheets (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references campaigns(id) on delete cascade,
  owner_id       uuid not null,
  character_name text default 'Unnamed Adventurer',
  sheet          jsonb not null default '{}'::jsonb,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (campaign_id, owner_id, character_name)
);

-- whole-document sync used by tools that share their entire state
-- (Group Inventory today; initiative tracker later)
create table shared_docs (
  campaign_id uuid not null references campaigns(id) on delete cascade,
  doc_key     text not null,               -- e.g. 'group-inventory'
  content     jsonb not null default '{}'::jsonb,
  client_id   text,                        -- which device wrote last (echo prevention)
  updated_at  timestamptz default now(),
  primary key (campaign_id, doc_key)
);

-- shared Game Log — every table roll, with GM-only hidden rolls
create table campaign_rolls (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  roller_id   uuid not null,
  roller_name text default '',
  char_name   text default '',
  label       text default 'Roll',
  notation    text default '',
  breakdown   text default '',
  total       integer not null default 0,
  crit        boolean not null default false,
  fumble      boolean not null default false,
  hidden      boolean not null default false,
  created_at  timestamptz default now()
);

create index campaign_rolls_feed on campaign_rolls (campaign_id, created_at desc);

-- ---------- updated_at maintenance ----------
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger t_notes_touch  before update on campaign_notes    for each row execute function touch_updated_at();
create trigger t_inv_touch    before update on inventory_items   for each row execute function touch_updated_at();
create trigger t_sheets_touch before update on character_sheets  for each row execute function touch_updated_at();
create trigger t_docs_touch   before update on shared_docs       for each row execute function touch_updated_at();

-- ---------- helper functions (security definer so policies don't recurse) ----------
create or replace function is_member(cid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from campaign_members
                 where campaign_id = cid and user_id = auth.uid());
$$;

create or replace function is_gm(cid uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from campaign_members
                 where campaign_id = cid and user_id = auth.uid() and role = 'gm');
$$;

-- ---------- create / join via RPC (so non-members never query tables directly) ----------
create or replace function create_campaign(campaign_name text, display_name text)
returns json language plpgsql security definer set search_path = public as $$
declare new_code text; cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  loop
    new_code := 'FORGE-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    begin
      insert into campaigns (join_code, name, gm_id)
      values (new_code, campaign_name, auth.uid())
      returning id into cid;
      exit;
    exception when unique_violation then null; -- rare collision → retry
    end;
  end loop;
  insert into campaign_members (campaign_id, user_id, display_name, role)
  values (cid, auth.uid(), display_name, 'gm');
  return json_build_object('campaign_id', cid, 'join_code', new_code, 'name', campaign_name, 'role', 'gm');
end $$;

create or replace function join_campaign(code text, display_name text)
returns json language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id, name, gm_id into c from campaigns where join_code = upper(trim(code));
  if not found then raise exception 'No campaign found with that code'; end if;
  insert into campaign_members (campaign_id, user_id, display_name, role)
  values (c.id, auth.uid(), display_name,
          case when c.gm_id = auth.uid() then 'gm' else 'player' end)
  on conflict (campaign_id, user_id) do update set display_name = excluded.display_name;
  return json_build_object('campaign_id', c.id, 'join_code', upper(trim(code)), 'name', c.name,
                           'role', case when c.gm_id = auth.uid() then 'gm' else 'player' end);
end $$;

-- ---------- row-level security ----------
alter table campaigns        enable row level security;
alter table campaign_members enable row level security;
alter table campaign_notes   enable row level security;
alter table inventory_items  enable row level security;
alter table character_sheets enable row level security;
alter table shared_docs      enable row level security;

-- campaigns: members can read; only the GM can rename or delete
create policy camp_select on campaigns for select using (is_member(id));
create policy camp_update on campaigns for update using (is_gm(id));
create policy camp_delete on campaigns for delete using (is_gm(id));

-- members: members see the roster; you can remove yourself; the GM can remove anyone
create policy mem_select on campaign_members for select using (is_member(campaign_id));
create policy mem_delete on campaign_members for delete
  using (user_id = auth.uid() or is_gm(campaign_id));

-- notes: THE DM-ONLY RULE LIVES HERE.
-- Players receive party notes only; DM-visibility notes are filtered by the
-- database itself and never reach a player's browser.
create policy notes_select on campaign_notes for select
  using (is_member(campaign_id)
         and (visibility = 'party' or is_gm(campaign_id) or author_id = auth.uid()));
create policy notes_insert on campaign_notes for insert
  with check (is_member(campaign_id)
              and author_id = auth.uid()
              and (visibility = 'party' or is_gm(campaign_id)));
create policy notes_update on campaign_notes for update
  using (author_id = auth.uid() or is_gm(campaign_id))
  with check (visibility = 'party' or is_gm(campaign_id));
create policy notes_delete on campaign_notes for delete
  using (author_id = auth.uid() or is_gm(campaign_id));

-- inventory: any member may contribute, edit, and remove
create policy inv_select on inventory_items for select using (is_member(campaign_id));
create policy inv_insert on inventory_items for insert with check (is_member(campaign_id));
create policy inv_update on inventory_items for update using (is_member(campaign_id));
create policy inv_delete on inventory_items for delete using (is_member(campaign_id));

-- sheets: whole party can view; only the owner or the GM can change them
create policy sheet_select on character_sheets for select using (is_member(campaign_id));
create policy sheet_insert on character_sheets for insert
  with check (is_member(campaign_id) and owner_id = auth.uid());
create policy sheet_update on character_sheets for update
  using (owner_id = auth.uid() or is_gm(campaign_id));
create policy sheet_delete on character_sheets for delete
  using (owner_id = auth.uid() or is_gm(campaign_id));

-- shared docs: any member reads; docs keyed 'gm:%' (e.g. the published Codex)
-- are writable only by the GM; only the GM can delete outright
create policy docs_select on shared_docs for select using (is_member(campaign_id));
create policy docs_insert on shared_docs for insert
  with check (is_member(campaign_id)
              and (doc_key not like 'gm:%' or is_gm(campaign_id)));
create policy docs_update on shared_docs for update
  using  (is_member(campaign_id)
          and (doc_key not like 'gm:%' or is_gm(campaign_id)))
  with check (is_member(campaign_id)
              and (doc_key not like 'gm:%' or is_gm(campaign_id)));
create policy docs_delete on shared_docs for delete using (is_gm(campaign_id));

alter table campaign_rolls enable row level security;

-- players see every visible roll; hidden rolls reach only the GM (and their roller)
create policy rolls_select on campaign_rolls for select
  using (is_member(campaign_id)
         and (not hidden or is_gm(campaign_id) or roller_id = auth.uid()));

-- you may only log rolls as yourself; only the GM may log hidden rolls
create policy rolls_insert on campaign_rolls for insert
  with check (is_member(campaign_id)
              and roller_id = auth.uid()
              and (not hidden or is_gm(campaign_id)));

-- the GM can prune the log
create policy rolls_delete on campaign_rolls for delete
  using (is_gm(campaign_id));

-- ---------- live updates ----------
-- Realtime honors the RLS policies above, so DM notes never broadcast to players.
alter publication supabase_realtime add table campaign_notes;
alter publication supabase_realtime add table inventory_items;
alter publication supabase_realtime add table character_sheets;
alter publication supabase_realtime add table campaign_members;
alter publication supabase_realtime add table shared_docs;
alter publication supabase_realtime add table campaign_rolls;
