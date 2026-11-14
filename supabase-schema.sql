-- ============================================================
-- Scadenziario – schema Supabase (v2 spazio condiviso + v3 schede + v4 ruoli e posta + v5 turni)
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


-- ============================================================
-- v3: schede specifiche (dettagli per casa/mezzo/altro), rate con fine, registro lavori
-- Additivo: non tocca i dati esistenti. Si può rilanciare senza danni.
-- ============================================================
alter table public.items     add column if not exists details jsonb not null default '{}'::jsonb;  -- dati delle schede
alter table public.deadlines add column if not exists section text;                                 -- a quale scheda appartiene
alter table public.deadlines add column if not exists until   date;                                 -- fine delle rate (mutuo, finanziamento)

-- Lavori, riparazioni e ricambi (es. "cambio olio", "pastiglie freni", "idraulico")
create table if not exists public.item_logs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  kind         text not null default 'lavoro',      -- lavoro | ricambio
  title        text not null,
  done_on      date not null default current_date,
  km           integer,
  amount       numeric(10,2),
  place        text,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists item_logs_item on public.item_logs (item_id, done_on desc);
create index if not exists item_logs_household on public.item_logs (household_id);

alter table public.item_logs enable row level security;
drop policy if exists "item_logs_household" on public.item_logs;
create policy "item_logs_household" on public.item_logs
  for all to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));


-- ============================================================
-- v4: sola lettura, gestione membri, posta in arrivo ("Da confermare")
-- Additivo e rilanciabile. I membri esistenti restano con i loro permessi.
-- ============================================================

-- Ruoli: owner (gestisce) | member (modifica) | viewer (solo lettura)
alter table public.households add column if not exists invite_code_view text unique
  default upper(substr(md5(random()::text || clock_timestamp()::text || 'v'), 1, 8));
update public.households set invite_code_view = upper(substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 8)) where invite_code_view is null;
alter table public.households add column if not exists inbox_token text unique
  default substr(md5(random()::text || clock_timestamp()::text || 't'), 1, 24) || substr(md5(random()::text || clock_timestamp()::text || 'u'), 1, 8);
update public.households set inbox_token = substr(md5(random()::text || id::text), 1, 24) || substr(md5(random()::text || clock_timestamp()::text), 1, 8) where inbox_token is null;

-- I codici e il token non si leggono più direttamente: si passa dalle funzioni qui sotto.
revoke select on public.households from authenticated, anon;
grant  select (id, name, created_by, created_at) on public.households to authenticated;
revoke update on public.households from authenticated, anon;
grant  update (name) on public.households to authenticated;

create or replace function public.can_edit(h uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = auth.uid() and m.role in ('owner', 'member')
  );
$$;
create or replace function public.is_owner(h uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- Il mio ruolo
create or replace function public.my_role(h uuid)
returns text language sql security definer stable set search_path = public as $$
  select role from public.household_members where household_id = h and user_id = auth.uid();
$$;

-- Entra con un codice: quello normale dà la modifica, quello "solo lettura" dà la sola lettura.
create or replace function public.join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare h uuid; cur uuid; r text; c text := upper(trim(p_code));
begin
  if auth.uid() is null then raise exception 'non autenticato'; end if;
  select id, 'member' into h, r from public.households where invite_code = c;
  if h is null then
    select id, 'viewer' into h, r from public.households where invite_code_view = c;
  end if;
  if h is null then raise exception 'codice non valido'; end if;
  select household_id into cur from public.household_members where user_id = auth.uid();
  if cur is not null and cur <> h then raise exception 'sei già in uno spazio condiviso'; end if;
  insert into public.household_members (household_id, user_id, role) values (h, auth.uid(), r) on conflict do nothing;
  return h;
end $$;

-- Codici e token: li vede solo chi gestisce lo spazio.
create or replace function public.get_invites(p_household uuid)
returns table (invite_code text, invite_code_view text, inbox_token text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_owner(p_household) then raise exception 'non autorizzato'; end if;
  return query select h.invite_code, h.invite_code_view, h.inbox_token from public.households h where h.id = p_household;
end $$;

-- Nuovo codice (kind: edit | view | token)
drop function if exists public.regenerate_invite(uuid);
create or replace function public.regenerate_invite(p_household uuid, p_kind text default 'edit')
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_owner(p_household) then raise exception 'non autorizzato'; end if;
  if p_kind = 'view' then
    update public.households set invite_code_view = upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) where id = p_household returning invite_code_view into c;
  elsif p_kind = 'token' then
    update public.households set inbox_token = substr(md5(random()::text || clock_timestamp()::text), 1, 24) || substr(md5(random()::text), 1, 8) where id = p_household returning inbox_token into c;
  else
    update public.households set invite_code = upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) where id = p_household returning invite_code into c;
  end if;
  return c;
end $$;

-- Elenco persone dello spazio (con e-mail e ruolo)
create or replace function public.list_members(p_household uuid)
returns table (user_id uuid, email text, role text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.is_member(p_household) then raise exception 'non autorizzato'; end if;
  return query
    select m.user_id, u.email::text, m.role
    from public.household_members m join auth.users u on u.id = m.user_id
    where m.household_id = p_household
    order by (m.role = 'owner') desc, m.created_at;
end $$;

create or replace function public.set_member_role(p_household uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_household) then raise exception 'non autorizzato'; end if;
  if p_role not in ('member', 'viewer') then raise exception 'ruolo non valido'; end if;
  if p_user = auth.uid() then raise exception 'non puoi cambiare il tuo ruolo'; end if;
  update public.household_members set role = p_role where household_id = p_household and user_id = p_user and role <> 'owner';
end $$;

create or replace function public.remove_member(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(p_household) then raise exception 'non autorizzato'; end if;
  if p_user = auth.uid() then raise exception 'non puoi rimuovere te stesso'; end if;
  delete from public.household_members where household_id = p_household and user_id = p_user and role <> 'owner';
end $$;

-- Posta in arrivo: proposte create dallo script Gmail, da confermare nell'app.
create table if not exists public.inbox (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ext_id       text not null,                       -- id univoco (messaggio + allegato) per non duplicare
  status       text not null default 'new',         -- new | done | dismissed
  sender       text,
  subject      text,
  kind         text,                                -- assicurazione, bolletta, ...
  title        text,
  due_date     date,
  amount       numeric(10,2),
  plate        text,
  ref          text,                                -- n. polizza / contratto
  link         text,                                -- collegamento alla mail
  note         text,
  paid_hint    boolean not null default false,      -- la mail sembra una quietanza/ricevuta di pagamento
  created_at   timestamptz not null default now(),
  unique (household_id, ext_id)
);
create index if not exists inbox_household_status on public.inbox (household_id, status);

-- Invio dallo script: serve il token dello spazio. Non richiede l'accesso (chiave pubblica + token).
create or replace function public.submit_inbox(p_token text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare h uuid; r jsonb; n integer := 0;
begin
  select id into h from public.households where inbox_token = p_token;
  if h is null then raise exception 'token non valido'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'dati non validi'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.inbox (household_id, ext_id, sender, subject, kind, title, due_date, amount, plate, ref, link, note, paid_hint)
    values (
      h, left(r->>'ext_id', 200), left(r->>'sender', 200), left(r->>'subject', 300), left(r->>'kind', 40), left(r->>'title', 200),
      nullif(r->>'due_date', '')::date, nullif(r->>'amount', '')::numeric, left(upper(r->>'plate'), 12), left(r->>'ref', 80),
      left(r->>'link', 500), left(r->>'note', 500), coalesce((r->>'paid_hint')::boolean, false)
    ) on conflict (household_id, ext_id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function public.can_edit(uuid), public.is_owner(uuid), public.my_role(uuid), public.get_invites(uuid),
  public.regenerate_invite(uuid, text), public.list_members(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid), public.submit_inbox(text, jsonb) from public, anon;
grant execute on function public.can_edit(uuid), public.is_owner(uuid), public.my_role(uuid), public.get_invites(uuid),
  public.regenerate_invite(uuid, text), public.list_members(uuid), public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.submit_inbox(text, jsonb) to anon, authenticated;

-- Politiche: tutti i membri leggono, scrive solo chi può modificare.
alter table public.inbox enable row level security;
drop policy if exists "inbox_select" on public.inbox;
create policy "inbox_select" on public.inbox for select to authenticated using (public.is_member(household_id));
drop policy if exists "inbox_update" on public.inbox;
create policy "inbox_update" on public.inbox for update to authenticated using (public.can_edit(household_id)) with check (public.can_edit(household_id));
drop policy if exists "inbox_delete" on public.inbox;
create policy "inbox_delete" on public.inbox for delete to authenticated using (public.can_edit(household_id));

do $$
declare t text;
begin
  foreach t in array array['items', 'deadlines', 'item_logs'] loop
    execute format('drop policy if exists "%1$s_household" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_read" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_ins" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_upd" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_del" on public.%1$s', t);
    execute format('create policy "%1$s_read" on public.%1$s for select to authenticated using (public.is_member(household_id))', t);
    execute format('create policy "%1$s_ins" on public.%1$s for insert to authenticated with check (public.can_edit(household_id))', t);
    execute format('create policy "%1$s_upd" on public.%1$s for update to authenticated using (public.can_edit(household_id)) with check (public.can_edit(household_id))', t);
    execute format('create policy "%1$s_del" on public.%1$s for delete to authenticated using (public.can_edit(household_id))', t);
  end loop;
end $$;

drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));

-- Link a documenti (mail, Drive…) nelle scadenze e nei lavori
alter table public.deadlines add column if not exists link text;
alter table public.item_logs add column if not exists link text;


-- ============================================================
-- v5: calendario dei turni di lavoro (un record per persona e giorno)
-- Additivo e rilanciabile.
-- ============================================================
create table if not exists public.shifts (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  day          date not null,
  kind         text not null,            -- id del tipo di turno (mattina, pomeriggio, notte, riposo, ferie… o uno personalizzato)
  note         text,
  created_at   timestamptz not null default now(),
  unique (item_id, day)
);
create index if not exists shifts_household_day on public.shifts (household_id, day);

alter table public.shifts enable row level security;
drop policy if exists "shifts_read" on public.shifts;
drop policy if exists "shifts_ins" on public.shifts;
drop policy if exists "shifts_upd" on public.shifts;
drop policy if exists "shifts_del" on public.shifts;
create policy "shifts_read" on public.shifts for select to authenticated using (public.is_member(household_id));
create policy "shifts_ins"  on public.shifts for insert to authenticated with check (public.can_edit(household_id));
create policy "shifts_upd"  on public.shifts for update to authenticated using (public.can_edit(household_id)) with check (public.can_edit(household_id));
create policy "shifts_del"  on public.shifts for delete to authenticated using (public.can_edit(household_id));


-- ============================================================
-- v7: orario negli appuntamenti. Additivo e rilanciabile.
-- ============================================================
alter table public.deadlines add column if not exists "time" text;
alter table public.inbox add column if not exists "time" text;

create or replace function public.submit_inbox(p_token text, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare h uuid; r jsonb; n integer := 0;
begin
  select id into h from public.households where inbox_token = p_token;
  if h is null then raise exception 'token non valido'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 50 then raise exception 'dati non validi'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.inbox (household_id, ext_id, sender, subject, kind, title, due_date, "time", amount, plate, ref, link, note, paid_hint)
    values (
      h, left(r->>'ext_id', 200), left(r->>'sender', 200), left(r->>'subject', 300), left(r->>'kind', 40), left(r->>'title', 200),
      nullif(r->>'due_date', '')::date, left(nullif(r->>'time', ''), 5), nullif(r->>'amount', '')::numeric, left(upper(r->>'plate'), 12), left(r->>'ref', 80),
      left(r->>'link', 500), left(r->>'note', 500), coalesce((r->>'paid_hint')::boolean, false)
    ) on conflict (household_id, ext_id) do nothing;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $$;
grant execute on function public.submit_inbox(text, jsonb) to anon, authenticated;
