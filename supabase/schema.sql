-- ==============================================================================
-- Shongjog (সংযোগ) Database Schema & Realtime Setup
-- Copy and run this in your Supabase Dashboard SQL Editor (https://supabase.com/dashboard/project/_/sql)
-- ==============================================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- 2. Profiles Table (Global Directory & Public Keys)
create table if not exists public.profiles (
  id text primary key,
  phone_number text not null,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text default 'Available on Shongjog direct network',
  device_id text not null,
  public_key text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Migration safety for existing deployments:
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text default 'Available on Shongjog direct network';

-- 3. Messages Table (Idempotent Storage & Cloud Sync)
create table if not exists public.messages (
  id text primary key,
  conversation_id text not null,
  sender_id text not null references public.profiles(id) on delete cascade,
  sender_device_id text not null,
  recipient_id text,
  type text not null default 'text', -- 'text', 'voice', 'file', 'call_event'
  content text not null,
  media_url text,
  file_name text,
  file_size bigint,
  mime_type text,
  duration_seconds integer,
  transport text not null default 'internet_supabase',
  status text not null default 'delivered',
  signature text,
  is_delivered_direct_offline boolean default false,
  created_at timestamptz default now()
);

-- 4. Conversations Table
create table if not exists public.conversations (
  id text primary key,
  type text not null default 'direct',
  participant_ids text[] not null,
  last_message_snippet text,
  last_message_timestamp bigint,
  updated_at timestamptz default now()
);

-- 5. Indexes for fast query performance
create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at desc);
create index if not exists idx_messages_recipient on public.messages (recipient_id);
create index if not exists idx_profiles_username on public.profiles (username);
create index if not exists idx_profiles_phone on public.profiles (phone_number);

-- 6. Row Level Security (RLS) - Permissive public access for client-side cryptographic mesh
alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.conversations enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Allow public select profiles" on public.profiles;
drop policy if exists "Allow public insert profiles" on public.profiles;
drop policy if exists "Allow public update profiles" on public.profiles;

drop policy if exists "Allow public select messages" on public.messages;
drop policy if exists "Allow public insert messages" on public.messages;

drop policy if exists "Allow public select conversations" on public.conversations;
drop policy if exists "Allow public upsert conversations" on public.conversations;

-- Permissive policies for anon key client operations
create policy "Allow public select profiles" on public.profiles for select using (true);
create policy "Allow public insert profiles" on public.profiles for insert with check (true);
create policy "Allow public update profiles" on public.profiles for update using (true);

create policy "Allow public select messages" on public.messages for select using (true);
create policy "Allow public insert messages" on public.messages for insert with check (true);

create policy "Allow public select conversations" on public.conversations for select using (true);
create policy "Allow public upsert conversations" on public.conversations for all using (true);

-- 7. Add Tables to Supabase Realtime Publication
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
