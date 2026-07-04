-- =====================================================================
-- ArcanaForge — Migration 4: shared Game Log (campaign_rolls)
-- Every linked roller writes here; everyone at the table sees the rolls
-- live. Rolls flagged hidden are GM-only: the database refuses to send
-- them to player identities, so players receive nothing at all.
-- Paste into Supabase → SQL Editor → Run.
-- =====================================================================

drop table if exists campaign_rolls cascade;

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

alter publication supabase_realtime add table campaign_rolls;
