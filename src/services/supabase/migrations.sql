-- Supabase PostgreSQL Schema Migration for Bangladesh Offline-First Communication Network
-- Supports online sync, idempotent delivery, device key attribution, RLS, and Realtime

-- 1. Profiles Table (Global Identity Directory)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    phone_number TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    public_key TEXT,
    device_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for speedy contact lookup by phone number or username
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone_number);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- 2. Contacts Table (User's synced address book)
CREATE TABLE IF NOT EXISTS public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    contact_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    phone_number TEXT NOT NULL,
    username TEXT,
    display_name TEXT NOT NULL,
    public_key TEXT,
    is_blocked BOOLEAN DEFAULT FALSE,
    notes TEXT,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);

-- 3. Conversations Table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
    name TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Conversation Participants Table
CREATE TABLE IF NOT EXISTS public.conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_part_user ON public.conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_part_conv ON public.conversation_participants(conversation_id);

-- 5. Unified Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY, -- Client-generated UUID for idempotency
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_device_id TEXT NOT NULL,
    recipient_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'voice', 'file', 'call_event')),
    content TEXT NOT NULL,
    media_url TEXT,
    file_name TEXT,
    file_size BIGINT,
    mime_type TEXT,
    duration_seconds INT,
    transport TEXT NOT NULL DEFAULT 'internet_supabase',
    status TEXT NOT NULL DEFAULT 'delivered' CHECK (status IN ('queued', 'sending', 'delivered', 'read', 'synced')),
    signature TEXT,
    is_delivered_direct_offline BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON public.messages(recipient_id);

-- 6. Call Records Table
CREATE TABLE IF NOT EXISTS public.call_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    callee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    status TEXT NOT NULL CHECK (status IN ('completed', 'missed', 'rejected', 'busy')),
    duration_seconds INT DEFAULT 0,
    transport TEXT NOT NULL DEFAULT 'internet_supabase',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_records_callee ON public.call_records(callee_id);
CREATE INDEX IF NOT EXISTS idx_call_records_caller ON public.call_records(caller_id);

-- 7. Row Level Security (RLS) Setup
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

-- Profiles: Public can read all verified profiles for contact discovery, users update their own
CREATE POLICY "Public profiles are readable by authenticated users" ON public.profiles
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own profile" ON public.profiles
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Contacts: Users manage their own contacts
CREATE POLICY "Users can view their own contacts" ON public.contacts
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts" ON public.contacts
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts" ON public.contacts
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Conversations & Participants
CREATE POLICY "Users can view conversations they participate in" ON public.conversations
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = id AND cp.user_id = auth.uid()
    ));

CREATE POLICY "Users can view participants of their conversations" ON public.conversation_participants
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.conversation_participants cp2
        WHERE cp2.conversation_id = conversation_id AND cp2.user_id = auth.uid()
    ));

-- Messages: Participants can read and insert messages
CREATE POLICY "Users can view messages in their conversations" ON public.messages
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = conversation_id AND cp.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert messages into their conversations" ON public.messages
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = sender_id);

-- Enable Supabase Realtime for instant messaging & presence
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
