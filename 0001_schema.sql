-- Saathi schema for Supabase (Postgres + Auth + Row Level Security).
-- Each domain table keeps the app row in `data jsonb` plus indexed key columns used by RLS.
-- Clinical tables are append-mostly; updates to treatments write the previous version to audit (app layer)
-- and the trigger below also snapshots every update into `row_history` (never overwritten).

create extension if not exists pgcrypto;

-- ---------- profiles linked to Supabase Auth ----------
create table if not exists public.users (
  id text primary key,
  auth_uid uuid unique references auth.users(id) on delete set null,
  org_id text,
  patient_id text,
  kind text not null check (kind in ('patient','carer','staff','platform')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------- generic domain tables ----------
do $$
declare t text;
begin
  foreach t in array array['orgs','departments','roles','patients','carer_links','care_team','treatments','doses','check_results',
    'observations','labs','adverse_events','alerts','messages','protocols','pathways','tasks_done','faq','audit','kb_reviews']
  loop
    execute format('create table if not exists public.%I (
      id text primary key,
      org_id text,
      patient_id text,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )', t);
    execute format('create index if not exists %I on public.%I (org_id)', t || '_org_idx', t);
    execute format('create index if not exists %I on public.%I (patient_id)', t || '_patient_idx', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
alter table public.users enable row level security;

-- ---------- history: every update/delete of a clinical row is snapshotted ----------
create table if not exists public.row_history (
  id bigserial primary key, tbl text not null, row_id text not null, op text not null,
  old_data jsonb, changed_by uuid default auth.uid(), changed_at timestamptz not null default now()
);
alter table public.row_history enable row level security;
create or replace function public.snapshot_row() returns trigger language plpgsql security definer as $$
begin
  insert into public.row_history (tbl, row_id, op, old_data) values (tg_table_name, old.id, tg_op, old.data);
  if tg_op = 'UPDATE' then new.updated_at := now(); return new; end if;
  return old;
end $$;
do $$
declare t text;
begin
  foreach t in array array['treatments','doses','check_results','observations','labs','adverse_events','alerts','protocols','pathways','patients']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_hist', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.snapshot_row()', t || '_hist', t);
  end loop;
end $$;

-- ---------- helper functions used by policies ----------
create or replace function public.me() returns public.users language sql stable security definer set search_path = public as $$
  select * from public.users where auth_uid = auth.uid() limit 1 $$;
create or replace function public.my_kind() returns text language sql stable security definer set search_path = public as $$ select kind from public.users where auth_uid = auth.uid() $$;
create or replace function public.my_org() returns text language sql stable security definer set search_path = public as $$ select org_id from public.users where auth_uid = auth.uid() $$;
create or replace function public.my_caps() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(r.data->'caps', '[]'::jsonb) from public.users u join public.roles r on r.org_id = u.org_id and r.data->>'key' = u.data->>'roleKey' where u.auth_uid = auth.uid() $$;
/** Patients this user may see: own record, linked as active carer, or patients registered with the staff member's organisation. */
create or replace function public.can_see_patient(pid text) returns boolean language sql stable security definer set search_path = public as $$
  select case public.my_kind()
    when 'platform' then true
    when 'patient' then pid = (select patient_id from public.users where auth_uid = auth.uid())
    when 'carer' then exists (select 1 from public.carer_links c where c.patient_id = pid and c.data->>'userId' = (select id from public.users where auth_uid = auth.uid()) and c.data->>'status' = 'active')
    when 'staff' then exists (select 1 from public.patients p where p.id = pid and p.data->'orgIds' ? public.my_org())
    else false end $$;
create or replace function public.can_see_org(oid text) returns boolean language sql stable security definer set search_path = public as $$
  select public.my_kind() = 'platform' or oid = public.my_org()
    or exists (select 1 from public.patients p where p.data->'orgIds' ? oid and public.can_see_patient(p.id)) $$;

-- ---------- policies ----------
-- patient-scoped tables
do $$
declare t text;
begin
  foreach t in array array['carer_links','care_team','treatments','doses','check_results','observations','labs','adverse_events','alerts','messages','pathways']
  loop
    execute format('drop policy if exists sel on public.%I', t);
    execute format('create policy sel on public.%I for select using (public.can_see_patient(patient_id))', t);
    execute format('drop policy if exists ins on public.%I', t);
    execute format('create policy ins on public.%I for insert with check (public.can_see_patient(patient_id))', t);
    execute format('drop policy if exists upd on public.%I', t);
    execute format('create policy upd on public.%I for update using (public.can_see_patient(patient_id))', t);
  end loop;
end $$;
-- Signing clinical content needs the 'sign' capability (treatments) — patients/carers can only add self-reported data.
drop policy if exists ins on public.treatments; create policy ins on public.treatments for insert with check (public.can_see_patient(patient_id) and (public.my_kind() = 'platform' or public.my_caps() ? 'sign'));
drop policy if exists upd on public.treatments; create policy upd on public.treatments for update using (public.can_see_patient(patient_id) and (public.my_kind() = 'platform' or public.my_caps() ? 'sign'));
drop policy if exists del on public.care_team; create policy del on public.care_team for delete using (public.can_see_patient(patient_id) and public.my_kind() in ('staff','platform'));

drop policy if exists sel on public.patients; create policy sel on public.patients for select using (public.can_see_patient(id));
drop policy if exists ins on public.patients; create policy ins on public.patients for insert with check (public.my_kind() = 'platform' or (public.my_caps() ? 'register' and data->'orgIds' ? public.my_org()));
drop policy if exists upd on public.patients; create policy upd on public.patients for update using (public.can_see_patient(id));

-- org-scoped tables
do $$
declare t text;
begin
  foreach t in array array['departments','roles','protocols','faq','kb_reviews','tasks_done']
  loop
    execute format('drop policy if exists sel on public.%I', t);
    execute format('create policy sel on public.%I for select using (public.can_see_org(org_id) or org_id is null)', t);
    execute format('drop policy if exists wr on public.%I', t);
    execute format('create policy wr on public.%I for all using (public.my_kind() = ''platform'' or (public.my_kind() = ''staff'' and (org_id = public.my_org() or org_id is null))) with check (public.my_kind() = ''platform'' or (public.my_kind() = ''staff'' and (org_id = public.my_org() or org_id is null)))', t);
  end loop;
end $$;
drop policy if exists sel on public.orgs; create policy sel on public.orgs for select using (public.can_see_org(id));
drop policy if exists wr on public.orgs; create policy wr on public.orgs for all using (public.my_kind() = 'platform' or (id = public.my_org() and public.my_caps() ? 'org'));

-- audit: append-only; readable by org admins
drop policy if exists ins on public.audit; create policy ins on public.audit for insert with check (auth.uid() is not null);
drop policy if exists sel on public.audit; create policy sel on public.audit for select using (public.my_kind() = 'platform' or (org_id = public.my_org() and public.my_caps() ? 'org'));

-- users: see yourself, your org's staff, and people linked to patients you can see. Writes only via the admin edge function (service role).
drop policy if exists sel on public.users;
create policy sel on public.users for select using (
  auth_uid = auth.uid() or public.my_kind() = 'platform'
  or (kind = 'staff' and public.can_see_org(org_id))
  or (kind = 'patient' and public.can_see_patient(patient_id))
  or (kind = 'carer' and exists (select 1 from public.carer_links c where c.data->>'userId' = users.id and public.can_see_patient(c.patient_id))));
drop policy if exists upd on public.users; create policy upd on public.users for update using (auth_uid = auth.uid() or public.my_kind() = 'platform' or (org_id = public.my_org() and public.my_caps() ? 'users'));

-- Public directory for the login screen: organisation names only (no PHI).
create or replace function public.public_org_directory() returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'name', data->>'name', 'type', data->>'type', 'city', data->>'city') from public.orgs order by data->>'name' $$;
grant execute on function public.public_org_directory() to anon, authenticated;
