-- ============================================================
-- Scadenziario - schema Supabase
-- Incolla tutto questo nel SQL Editor di Supabase e premi "Run".
-- ============================================================

-- Elementi: una macchina, una casa, ecc.
create table if not exists public.items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category   text not null default 'auto',      -- auto | casa | altro
  name       text not null,                      -- es. "Fiat Panda", "Appartamento in affitto"
  note       text,
  created_at timestamptz not null default now()
);

-- Scadenze / spese
create table if not exists public.deadlines (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_id     uuid references public.items(id) on delete cascade,
  kind        text not null,                     -- assicurazione, bollo, revisione, ...
  title       text not null,
  due_date    date not null,
  amount      numeric(10,2),                     -- importo, può essere vuoto
  recurrence  text not null default 'none',      -- none | monthly | bimonthly | quarterly | semiannual | yearly | biennial
  paid        boolean not null default false,
  paid_on     date,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists deadlines_user_due on public.deadlines (user_id, due_date);
create index if not exists items_user on public.items (user_id);

-- Sicurezza: ognuno vede solo i propri dati
alter table public.items     enable row level security;
alter table public.deadlines enable row level security;

drop policy if exists "items_own" on public.items;
create policy "items_own" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "deadlines_own" on public.deadlines;
create policy "deadlines_own" on public.deadlines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
