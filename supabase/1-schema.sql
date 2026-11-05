-- Bakery Hub database setup
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.
-- Safe to run once on a new project.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- People and roles
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  role text not null default 'staff' check (role in ('owner','manager','staff')),
  position text default '',
  phone text default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- true when the signed-in person is the owner or a manager
create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('owner','manager') and active
  );
$$;

-- Every new login gets a profile. The very first person to sign up becomes the owner.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
    case when (select count(*) from public.profiles) = 0 then 'owner' else 'staff' end
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Staff can edit their own name and phone, but only managers can change roles,
-- positions or deactivate someone. Nobody can demote the owner except the owner.
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Changes made from the Supabase dashboard (no signed-in app user) are always allowed.
  if auth.uid() is null then
    return new;
  end if;
  if not public.is_manager() then
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.position is distinct from old.position then
      raise exception 'Only managers can change roles, positions or status';
    end if;
  end if;
  if old.role = 'owner' and new.role <> 'owner' and auth.uid() <> old.id then
    raise exception 'Only the owner can change the owner role';
  end if;
  if new.role = 'owner' and old.role <> 'owner'
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'owner') then
    raise exception 'Only the owner can make someone an owner';
  end if;
  return new;
end $$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;
create policy "team can see team" on public.profiles for select to authenticated using (true);
create policy "edit self or managers edit anyone" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_manager())
  with check (id = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------
-- Calendar reminders
-- ---------------------------------------------------------------
create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  time time,
  repeat text not null default 'none' check (repeat in ('none','daily','weekly','monthly','yearly')),
  priority text not null default 'critical' check (priority in ('critical','normal')),
  category text default 'Other',
  notes text default '',
  done_dates date[] not null default '{}',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.reminders enable row level security;
create policy "team reads reminders" on public.reminders for select to authenticated using (true);
create policy "managers write reminders" on public.reminders for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------
-- Team board and managers-only board
-- ---------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'team' check (channel in ('team','managers')),
  body text not null check (length(body) between 1 and 4000),
  author uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.messages (channel, created_at desc);
alter table public.messages enable row level security;
create policy "read team board, managers read both" on public.messages for select to authenticated
  using (channel = 'team' or public.is_manager());
create policy "post as yourself" on public.messages for insert to authenticated
  with check (author = auth.uid() and (channel = 'team' or public.is_manager()));
create policy "managers pin" on public.messages for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
create policy "delete own or managers delete" on public.messages for delete to authenticated
  using (author = auth.uid() or public.is_manager());

-- ---------------------------------------------------------------
-- Private one-to-one messages: only the sender and recipient can ever read them
-- (not even the owner or managers).
-- ---------------------------------------------------------------
create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.direct_messages (recipient, created_at desc);
create index on public.direct_messages (sender, created_at desc);
alter table public.direct_messages enable row level security;
create policy "only the two people read" on public.direct_messages for select to authenticated
  using (sender = auth.uid() or recipient = auth.uid());
create policy "send as yourself" on public.direct_messages for insert to authenticated
  with check (sender = auth.uid() and recipient <> auth.uid());
create policy "recipient marks read" on public.direct_messages for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy "sender deletes own" on public.direct_messages for delete to authenticated
  using (sender = auth.uid());

-- ---------------------------------------------------------------
-- Inventory and vendor orders
-- ---------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'Supplies',
  unit text default '',
  on_hand numeric not null default 0,
  par numeric not null default 0,
  vendor text default '',
  notes text default '',
  updated_at timestamptz not null default now()
);
alter table public.inventory_items enable row level security;
create policy "team reads inventory" on public.inventory_items for select to authenticated using (true);
create policy "managers write inventory" on public.inventory_items for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

create table public.vendor_orders (
  id uuid primary key default gen_random_uuid(),
  vendor text not null,
  status text not null default 'draft' check (status in ('draft','placed','received')),
  expected date,
  placed_date date,
  received_date date,
  notes text default '',
  lines jsonb not null default '[]',   -- [{item_id, name, qty}]
  updated_at timestamptz not null default now()
);
alter table public.vendor_orders enable row level security;
create policy "team reads orders" on public.vendor_orders for select to authenticated using (true);
create policy "managers write orders" on public.vendor_orders for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------
-- Schedule
-- ---------------------------------------------------------------
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  note text default ''
);
create index on public.shifts (date);
alter table public.shifts enable row level security;
create policy "team reads schedule" on public.shifts for select to authenticated using (true);
create policy "managers write schedule" on public.shifts for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ---------------------------------------------------------------
-- Sales and labor from Toast (written only by the toast-sync function)
-- ---------------------------------------------------------------
create table public.sales_daily (
  business_date date primary key,
  net_sales numeric not null default 0,
  tax numeric not null default 0,
  total_collected numeric not null default 0,
  order_count int not null default 0,
  labor_cost numeric not null default 0,
  labor_hours numeric not null default 0,
  updated_at timestamptz not null default now()
);
create table public.sales_hourly (
  business_date date not null,
  hour int not null check (hour between 0 and 23),
  net_sales numeric not null default 0,
  order_count int not null default 0,
  primary key (business_date, hour)
);
create table public.sales_items (
  business_date date not null,
  item text not null,
  qty numeric not null default 0,
  sales numeric not null default 0,
  primary key (business_date, item)
);
create table public.sync_log (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  ok boolean not null,
  message text
);
alter table public.sales_daily enable row level security;
alter table public.sales_hourly enable row level security;
alter table public.sales_items enable row level security;
alter table public.sync_log enable row level security;
create policy "managers read sales" on public.sales_daily for select to authenticated using (public.is_manager());
create policy "managers read hourly" on public.sales_hourly for select to authenticated using (public.is_manager());
create policy "managers read items" on public.sales_items for select to authenticated using (public.is_manager());
create policy "managers read sync log" on public.sync_log for select to authenticated using (public.is_manager());

-- ---------------------------------------------------------------
-- Live updates in the app (they still respect the privacy rules above)
-- ---------------------------------------------------------------
alter publication supabase_realtime add table
  public.profiles, public.reminders, public.messages, public.direct_messages,
  public.inventory_items, public.vendor_orders, public.shifts, public.sales_daily;
