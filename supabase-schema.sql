-- ============================================================
-- Scadenziario v2 – schema Supabase con spazio condiviso
--
-- Incolla tutto nel SQL Editor di Supabase e premi "Run".
-- Vale sia per un progetto nuovo sia per uno che ha già la v1:
--   - i dati esistenti vengono conservati (ogni utente ottiene il suo spazio);
--   - le categorie vecchie "auto" diventano "mezzi".
-- Si può rilanciare più volte senza danni.
-- ============================================================

-- ---------- Spazi condivisi (famiglie) ----------
create table if not exists public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'La nostra famiglia',
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role         text not null default 'member',   -- owner | member
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- una persona appartiene a un solo spazio
create unique index if not exists household_members_one_per_user on public.household_members (user_id);

-- ---------- Elementi (casa, mezzi, altro) e scadenze ----------
create table if not exists public.items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,  -- chi l'ha creato
  category     text not null default 'casa',      -- casa | mezzi | altro
  subtype      text,                              -- per le case: affitto | proprieta
  name         text not null,
  note         text,
  created_at   timestamptz not null default now()
);

create table if not exists public.deadlines (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id      uuid references public.items(id) on delete cascade,
  kind         text not null,
  title        text not null,
  due_date     date not null,
  amount       numeric(10,2),
  recurrence   text not null default 'none',      -- none | monthly | bimonthly | quarterly | semiannual | yearly | biennial
  paid         boolean not null default false,
  paid_on      date,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------- Migrazione dalla v1 (se c'è) ----------
alter table public.items     add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.items     add column if not exists subtype text;
alter table public.deadlines add column if not exists household_id uuid references public.households(id) on delete cascade;

do $$
declare u record; h uuid;
begin
  for u in
    select user_id from public.items     where household_id is null
    union
    select user_id from public.deadlines where household_id is null
  loop
    insert into public.households (created_by) values (u.user_id) returning id into h;
    insert into public.household_members (household_id, user_id, role) values (h, u.user_id, 'owner');
    update public.items     set household_id = h where user_id = u.user_id and household_id is null;
    update public.deadlines set household_id = h where user_id = u.user_id and household_id is null;
  end loop;
end $$;

update public.items set category = 'mezzi' where category = 'auto';

alter table public.items     alter column household_id set not null;
alter table public.deadlines alter column household_id set not null;

create index if not exists deadlines_household_due on public.deadlines (household_id, due_date);
create index if not exists items_household on public.items (household_id);

-- ---------- Funzioni ----------
-- True se la persona collegata fa parte dello spazio indicato.
create or replace function public.is_member(h uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = auth.uid()
  );
$$;

-- Crea il tuo spazio e ti ci mette dentro.
create or replace function public.create_household(p_name text default 'La nostra famiglia')
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid;
begin
  if auth.uid() is null then raise exception 'non autenticato'; end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'sei già in uno spazio condiviso';
  end if;
  insert into public.households (name, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'La nostra famiglia'), auth.uid())
    returning id into h;
  insert into public.household_members (household_id, user_id, role) values (h, auth.uid(), 'owner');
  return h;
end $$;

-- Entra in uno spazio con il codice invito.
create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid; cur uuid;
begin
  if auth.uid() is null then raise exception 'non autenticato'; end if;
  select id into h from public.households where invite_code = upper(trim(p_code));
  if h is null then raise exception 'codice non valido'; end if;
  select household_id into cur from public.household_members where user_id = auth.uid();
  if cur is not null and cur <> h then raise exception 'sei già in uno spazio condiviso'; end if;
  insert into public.household_members (household_id, user_id) values (h, auth.uid()) on conflict do nothing;
  return h;
end $$;

-- Genera un nuovo codice invito (il vecchio smette di funzionare).
create or replace function public.regenerate_invite(p_household uuid)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_member(p_household) then raise exception 'non autorizzato'; end if;
  update public.households
     set invite_code = upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8))
   where id = p_household
   returning invite_code into c;
  return c;
end $$;

revoke all on function public.is_member(uuid)            from public, anon;
revoke all on function public.create_household(text)     from public, anon;
revoke all on function public.join_household(text)       from public, anon;
revoke all on function public.regenerate_invite(uuid)    from public, anon;
grant execute on function public.is_member(uuid)         to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.join_household(text)    to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;

-- ---------- Sicurezza (RLS): vede e modifica solo chi è nello spazio ----------
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.items             enable row level security;
alter table public.deadlines         enable row level security;

drop policy if exists "items_own" on public.items;
drop policy if exists "deadlines_own" on public.deadlines;

drop policy if exists "households_select" on public.households;
create policy "households_select" on public.households
  for select to authenticated using (public.is_member(id));

drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "members_select" on public.household_members;
create policy "members_select" on public.household_members
  for select to authenticated using (public.is_member(household_id));

drop policy if exists "members_leave" on public.household_members;
create policy "members_leave" on public.household_members
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "items_household" on public.items;
create policy "items_household" on public.items
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));

drop policy if exists "deadlines_household" on public.deadlines;
create policy "deadlines_household" on public.deadlines
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
