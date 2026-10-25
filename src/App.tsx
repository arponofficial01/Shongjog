import React, { useState, useEffect, useRef } from 'react';
import {
  UserPlus,
  Settings,
  Search,
  Phone,
  Paperclip,
  Mic,
  Send,
  Check,
  CheckCheck,
  Clock,
  ArrowLeft,
  ShieldCheck,
  FileText,
  Radio,
  Copy,
  Trash2,
  X,
  Info,
  MoreVertical,
} from 'lucide-react';

import { getDatabase } from './services/db/database';
import type {
  UserProfile,
  Contact,
  Conversation,
  Message,
} from './services/db/database';
import { IdentityService } from './services/identity/identityService';
import { TransportManager } from './services/transport/transportManager';
import { WebRTCService } from './services/transport/webrtcService';
import { SupabaseRealtimeService } from './services/transport/supabaseRealtimeService';
import { CallManager } from './services/call/callManager';
import type { ActiveCallSession } from './services/call/callManager';
import { VoiceRecorder } from './services/media/voiceRecorder';
import { FileTransferService } from './services/media/fileTransferService';

import { VoiceBubble } from './components/VoiceBubble';
import { AudioCallModal } from './components/AudioCallModal';
import { ContactModal } from './components/ContactModal';
import { SettingsPanel } from './components/SettingsPanel';
import { ProfileSetupModal } from './components/ProfileSetupModal';

// Subtle Web Audio tactile acoustic click
function playAcousticTick(isOutgoing: boolean = true) {
  try {
    if (localStorage.getItem('shongjog_sound_fx') === 'false') return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isOutgoing ? 680 : 840, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(isOutgoing ? 420 : 920, ctx.currentTime + 0.04);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    // Ignore audio context block if user hasn't interacted yet
  }
}

export const App: React.FC = () => {
  // --- Profile & Navigation State ---
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [, setLangTick] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Collections
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Drawers & Modals
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showNewContactDrawer, setShowNewContactDrawer] = useState(false);
  const [showPeerDetails, setShowPeerDetails] = useState(false);

  // Searches
  const [searchQuery, setSearchQuery] = useState('');
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'direct'>('all');

  // Messaging Input
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Audio Call
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);

  // Message Three-Dot/Three-Line Options Menu
  const [activeMenuMsgId, setActiveMenuMsgId] = useState<string | null>(null);

  // Refs
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);

  // Sync ref with state
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // Click outside closes active message menu
  useEffect(() => {
    const handleCloseMenu = () => setActiveMenuMsgId(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  // 1. App Startup, Auto-Detect Network, & Realtime Subscriptions
  useEffect(() => {
    // Apply persisted theme attributes to HTML
    const savedTheme = localStorage.getItem('shongjog_theme') || 'emerald';
    const savedWp = localStorage.getItem('shongjog_wallpaper') || 'aurora';
    const savedFs = localStorage.getItem('shongjog_font_size') || 'standard';
    const savedBs = localStorage.getItem('shongjog_bubble_style') || 'squircle';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-wallpaper', savedWp);
    document.documentElement.setAttribute('data-font-size', savedFs);
    document.documentElement.setAttribute('data-bubble-style', savedBs);

    // Auto-detect online / offline seamlessly with zero manual toggles
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    async function initApp() {
      TransportManager.init();

      // Listen for incoming audio calls
      const callMgr = CallManager.getInstance();
      callMgr.onSessionChange = (session) => {
        setActiveCallSession(session);
      };

      // 1. Listen for incoming real-time messages across ALL transports (WebRTC, Supabase Realtime, BroadcastChannel)
      TransportManager.onIncomingMessage = (newMsg: Message) => {
        console.log('Incoming real-time message received:', newMsg);
        playAcousticTick(false);

        // Update messages state if active conversation matches
        if (activeConversationIdRef.current === newMsg.conversationId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }

        // Update conversations snippet & unread count
        setConversations((prev) => {
          const index = prev.findIndex((c) => c.id === newMsg.conversationId);
          if (index >= 0) {
            const updated = [...prev];
            const isCurrentChat = activeConversationIdRef.current === newMsg.conversationId;
            updated[index] = {
              ...updated[index],
              lastMessageSnippet: newMsg.content,
              lastMessageTimestamp: newMsg.timestamp,
              unreadCount: isCurrentChat ? 0 : (updated[index].unreadCount || 0) + 1,
              updatedAt: Date.now(),
            };
            return updated.sort((a, b) => b.updatedAt - a.updatedAt);
          } else {
            // New conversation discovered in real-time
            const brandNewConv: Conversation = {
              id: newMsg.conversationId,
              type: 'direct',
              participantIds: [newMsg.senderId, newMsg.recipientId || ''].filter(Boolean),
              lastMessageSnippet: newMsg.content,
              lastMessageTimestamp: newMsg.timestamp,
              unreadCount: activeConversationIdRef.current === newMsg.conversationId ? 0 : 1,
              updatedAt: Date.now(),
            };
            return [brandNewConv, ...prev];
          }
        });
      };

      // 2. Real-time Reaction Updates
      TransportManager.onReactionUpdate = (msgId, reactions) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, reactions } : m))
        );
      };

      // 3. Real-time Message Deletions
      TransportManager.onDeleteMessage = (msgId) => {
        setMessages((prev) => prev.filter((m) => m.id !== msgId));
      };

      // 4. Real-time Clear History
      TransportManager.onClearHistory = (conversationId) => {
        if (activeConversationIdRef.current === conversationId) {
          setMessages([]);
        }
      };

      // 5. Real-time Delete Entire Conversation
      TransportManager.onDeleteConversation = (conversationId) => {
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));
        if (activeConversationIdRef.current === conversationId) {
          setActiveConversationId(null);
          setMessages([]);
          setShowPeerDetails(false);
        }
      };

      const user = await IdentityService.getActiveProfile();
      if (user) {
        setProfile(user);
        await loadUserData(user.id);
        // Connect Live Supabase Realtime WebSocket for instant cross-device delivery
        SupabaseRealtimeService.getInstance().initForUser(user.id, user.username);
      }
      setIsInitializing(false);
    }

    initApp();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 2. Load contacts & conversations
  const loadUserData = async (_userId?: string) => {
    const db = await getDatabase();
    let storedContacts = await db.getAll('contacts');

    if (storedContacts.length === 0) {
      const demoContacts: Contact[] = [
        {
          id: 'demo_1',
          phoneNumber: '+880 1712 345678',
          displayName: 'Tanvir Ahmed',
          username: 'tanvir_bd',
          isBlocked: false,
          lastSeen: Date.now() - 1000 * 60 * 3,
        },
        {
          id: 'demo_2',
          phoneNumber: '+880 1819 876543',
          displayName: 'Nusrat Jahan',
          username: 'nusrat_j',
          isBlocked: false,
          lastSeen: Date.now() - 1000 * 60 * 20,
        },
        {
          id: 'demo_3',
          phoneNumber: '+880 1911 223344',
          displayName: 'Dhaka Mesh Node',
          username: 'dhaka_mesh',
          isBlocked: false,
          lastSeen: Date.now() - 1000 * 60 * 60,
        },
      ];
      for (const c of demoContacts) {
        await db.put('contacts', c);
      }
      storedContacts = demoContacts;
    }
    setContacts(storedContacts);

    let storedConversations = await db.getAll('conversations');
    if (storedConversations.length === 0 && storedContacts.length > 0) {
      const initialConvs: Conversation[] = [
        {
          id: 'conv_1',
          type: 'direct',
          participantIds: [_userId || '', storedContacts[0].id],
          lastMessageSnippet: 'Assalamu Alaikum! Ready for the direct mesh call test?',
          lastMessageTimestamp: Date.now() - 1000 * 60 * 3,
          unreadCount: 1,
          updatedAt: Date.now() - 1000 * 60 * 3,
        },
        {
          id: 'conv_2',
          type: 'direct',
          participantIds: [_userId || '', storedContacts[1].id],
          lastMessageSnippet: '🎙️ Voice note (0:12)',
          lastMessageTimestamp: Date.now() - 1000 * 60 * 30,
          unreadCount: 0,
          updatedAt: Date.now() - 1000 * 60 * 30,
        },
      ];
      for (const conv of initialConvs) {
        await db.put('conversations', conv);
      }
      storedConversations = initialConvs;
    }

    storedConversations.sort((a, b) => b.updatedAt - a.updatedAt);
    setConversations(storedConversations);
  };

  const loadMessages = async (convId: string) => {
    const db = await getDatabase();
    let msgs = await db.getAllFromIndex('messages', 'by-conversation', convId);

    if (msgs.length === 0) {
      const activeConv = conversations.find((c) => c.id === convId);
      const peerId = activeConv?.participantIds.find((id) => id !== profile?.id) || 'demo_1';
      msgs = [
        {
          id: 'starter_1',
          conversationId: convId,
          senderId: peerId,
          senderDeviceId: 'peer_dev',
          recipientId: profile?.id,
          type: 'text',
          content: 'Assalamu Alaikum! Welcome to Shongjog (সংযোগ). Send a message, voice note, or start a direct call!',
          timestamp: Date.now() - 1000 * 60 * 8,
          status: 'read',
          transport: 'internet_supabase',
        },
      ];
      for (const m of msgs) {
        await db.put('messages', m);
      }
    }

    msgs.sort((a, b) => a.timestamp - b.timestamp);
    setMessages(msgs);
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 3. Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile || !activeConversationId || !inputText.trim()) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const peerId = activeConv?.participantIds.find((id) => id !== profile.id);

    const newMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      senderId: profile.id,
      senderDeviceId: profile.deviceId,
      recipientId: peerId,
      type: 'text',
      content: inputText.trim(),
      timestamp: Date.now(),
      status: 'sending',
      transport: isOnline ? 'internet_supabase' : 'offline_queued',
    };

    setInputText('');
    setMessages((prev) => [...prev, newMsg]);
    playAcousticTick(true);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    await TransportManager.dispatchMessage(newMsg, peerId);
    await loadUserData(profile.id);
  };

  // 4. Voice Note Recording (Real Audio Blob + Base64 URL Transmission)
  const handleToggleVoiceRecord = async () => {
    if (isRecordingVoice) {
      if (!voiceRecorderRef.current || !profile || !activeConversationId) return;
      try {
        const result = await voiceRecorderRef.current.stopRecording();
        setIsRecordingVoice(false);

        const activeConv = conversations.find((c) => c.id === activeConversationId);
        const peerId = activeConv?.participantIds.find((id) => id !== profile.id);

        const voiceMsg: Message = {
          id: crypto.randomUUID(),
          conversationId: activeConversationId,
          senderId: profile.id,
          senderDeviceId: profile.deviceId,
          recipientId: peerId,
          type: 'voice',
          content: 'Voice note',
          media: {
            blobKey: result.blobKey,
            url: result.dataUrl, // Inline Base64 Data URL transmits and plays on ANY other tab/device!
            durationSeconds: result.durationSeconds,
            waveform: result.waveform,
            mimeType: result.mimeType,
          },
          timestamp: Date.now(),
          status: 'sending',
          transport: isOnline ? 'internet_supabase' : 'offline_queued',
        };

        setMessages((prev) => [...prev, voiceMsg]);
        playAcousticTick(true);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

        await TransportManager.dispatchMessage(voiceMsg, peerId);
        await loadUserData(profile.id);
      } catch (e) {
        console.error('Error saving voice note', e);
        setIsRecordingVoice(false);
      }
    } else {
      const recorder = new VoiceRecorder();
      voiceRecorderRef.current = recorder;
      recorder.onTimerTick = (sec) => setRecordingSeconds(sec);

      try {
        await recorder.startRecording();
        setIsRecordingVoice(true);
        setRecordingSeconds(0);
      } catch (err) {
        alert('Microphone permission is required to record voice notes.');
      }
    }
  };

  // 5. Send File (With Real Base64 Data URL)
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !activeConversationId) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const peerId = activeConv?.participantIds.find((id) => id !== profile.id);

    const rtc = peerId ? WebRTCService.getInstance(profile.id, peerId) : null;
    let blobKey = 'file_' + crypto.randomUUID();

    if (rtc && peerId && TransportManager.isPeerDirectlyConnected(peerId)) {
      await FileTransferService.sendFileDirect(file, file.name, rtc);
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;

      const fileMsg: Message = {
        id: crypto.randomUUID(),
        conversationId: activeConversationId,
        senderId: profile.id,
        senderDeviceId: profile.deviceId,
        recipientId: peerId,
        type: 'file',
        content: file.name,
        media: {
          blobKey,
          url: dataUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        },
        timestamp: Date.now(),
        status: 'sending',
        transport: isOnline ? 'internet_supabase' : 'offline_queued',
      };

      setMessages((prev) => [...prev, fileMsg]);
      playAcousticTick(true);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

      await TransportManager.dispatchMessage(fileMsg, peerId);
      await loadUserData(profile.id);
    };
  };

  // 6. Direct Audio Calling
  const handleStartCall = async () => {
    if (!profile || !activeConversationId) return;
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const peerId = activeConv?.participantIds.find((id) => id !== profile.id);
    if (!peerId) return;

    const contact = contacts.find((c) => c.id === peerId);
    const name = contact?.displayName || 'Contact';

    try {
      await CallManager.getInstance().startOutgoingCall(
        profile.id,
        profile.displayName,
        peerId,
        name,
        contact?.phoneNumber,
        isOnline ? 'internet_supabase' : 'direct_webrtc_lan'
      );
    } catch (err: any) {
      alert(err.message || 'Cannot start audio call');
    }
  };

  // 7. Chat Modification Features: Real-Time Emoji Reactions, Copy, Delete, Clear History
  const handleReactToMessage = async (msgId: string, emoji: string) => {
    const db = await getDatabase();
    const msg = await db.get('messages', msgId);
    if (!msg) return;

    const currentReactions = msg.reactions || {};
    const currentCount = currentReactions[emoji] || 0;
    const updatedReactions = { ...currentReactions, [emoji]: currentCount + 1 };
    msg.reactions = updatedReactions;

    await db.put('messages', msg);

    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, reactions: updatedReactions } : m))
    );

    // Broadcast reaction update across all connected windows, tabs, and peers in real-time
    TransportManager.broadcastEvent({
      type: 'reaction_update',
      msgId,
      reactions: updatedReactions,
      conversationId: activeConversationId,
    });
  };

  const handleDeleteMessage = async (msgId: string) => {
    const db = await getDatabase();
    await db.delete('messages', msgId);
    setMessages((prev) => prev.filter((m) => m.id !== msgId));

    // Broadcast deletion across all connected tabs and peers in real-time
    TransportManager.broadcastEvent({
      type: 'delete_message',
      msgId,
      conversationId: activeConversationId,
    });
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleClearChatHistory = async () => {
    if (!activeConversationId) return;
    if (confirm('Clear all messages in this conversation?')) {
      const db = await getDatabase();
      const allMsgs = await db.getAllFromIndex('messages', 'by-conversation', activeConversationId);
      for (const m of allMsgs) {
        await db.delete('messages', m.id);
      }
      setMessages([]);
      setShowPeerDetails(false);

      // Broadcast history clear event across all tabs and peers in real-time
      TransportManager.broadcastEvent({
        type: 'clear_history',
        conversationId: activeConversationId,
      });

      await loadUserData(profile?.id);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!confirm('Are you sure you want to permanently delete this entire chat and all its messages?')) return;
    try {
      const db = await getDatabase();
      await db.delete('conversations', convId);
      const allMsgs = await db.getAllFromIndex('messages', 'by-conversation', convId);
      for (const m of allMsgs) {
        await db.delete('messages', m.id);
      }
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        setActiveConversationId(null);
        setMessages([]);
        setShowPeerDetails(false);
      }
      // Broadcast deletion across all connected tabs and peers in real-time
      TransportManager.broadcastEvent({
        type: 'delete_conversation',
        conversationId: convId,
      });
    } catch (err) {
      console.error('Failed to delete conversation', err);
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activePeerId = activeConversation?.participantIds.find((id) => id !== profile?.id);
  const activeContact = contacts.find((c) => c.id === activePeerId);
  const activeChatName = activeContact?.displayName || 'Conversation';

  // Filter active messages by in-chat search query if active
  const displayedMessages = messages.filter((m) => {
    if (!showInChatSearch || !inChatSearchQuery.trim()) return true;
    return m.content.toLowerCase().includes(inChatSearchQuery.toLowerCase());
  });

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#05080d', color: '#10b981' }}>
        <Radio className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className={`shongjog-app-root ${activeConversationId ? 'mobile-chat-open' : ''}`}>
      {/* Onboarding Identity Modal with @username */}
      {!profile && (
        <ProfileSetupModal
          onProfileCreated={(newProfile) => {
            setProfile(newProfile);
            loadUserData(newProfile.id);
            SupabaseRealtimeService.getInstance().initForUser(newProfile.id, newProfile.username);
          }}
        />
      )}

      {/* Acoustic Soundwave Voice Call Overlay */}
      {activeCallSession && profile && (
        <AudioCallModal session={activeCallSession} localUserId={profile.id} />
      )}

      {/* ==========================================================================
          LEFT SIDEBAR: Shongjog Brand Header, Search, Filter Tabs, Chat Stream
          ========================================================================== */}
      <aside className="shongjog-sidebar">
        {/* Settings Drawer (Theme Picker, Wallpaper, Font Scale, etc.) */}
        {showSettingsDrawer && profile && (
          <SettingsPanel
            profile={profile}
            onBack={() => setShowSettingsDrawer(false)}
            onLanguageChange={() => setLangTick((t) => t + 1)}
            onProfileReset={() => {
              IdentityService.logout();
              setProfile(null);
            }}
          />
        )}

        {/* New Contact Drawer with @username */}
        {showNewContactDrawer && (
          <ContactModal
            onClose={() => setShowNewContactDrawer(false)}
            onContactSaved={(contact) => {
              setContacts((prev) => [contact, ...prev]);
              const newConv: Conversation = {
                id: crypto.randomUUID(),
                type: 'direct',
                participantIds: [profile?.id || '', contact.id],
                lastMessageSnippet: 'Conversation opened',
                lastMessageTimestamp: Date.now(),
                unreadCount: 0,
                updatedAt: Date.now(),
              };
              setConversations((prev) => [newConv, ...prev]);
              setActiveConversationId(newConv.id);
              loadMessages(newConv.id);
            }}
          />
        )}

        {/* Shongjog (সংযোগ) Brand Header */}
        <div className="shongjog-sidebar-header">
          <div
            className="brand-section-box"
            onClick={() => setShowSettingsDrawer(true)}
            title="Profile, Theme & Customization Settings"
          >
            <div className="brand-logo-orb">
              <Radio size={22} />
            </div>
            <div className="brand-meta-column">
              <div className="brand-main-title">
                Shongjog
                <span className="brand-bengali-script">সংযোগ</span>
              </div>
              <span className="brand-tagline-text">
                {isOnline ? 'AUTO-SYNC MESH' : 'OFFLINE P2P MESH'}
              </span>
            </div>
          </div>

          <div className="header-tools-cluster">
            {/* Clean action buttons: New Chat and Settings */}
            <button
              type="button"
              className="icon-button-lux new-chat-btn"
              onClick={() => setShowNewContactDrawer(true)}
              title="New Chat"
            >
              <UserPlus size={18} />
            </button>
            <button
              type="button"
              className="icon-button-lux"
              onClick={() => setShowSettingsDrawer(true)}
              title="Settings & Themes"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="sidebar-search-area">
          <div className="lux-search-shell">
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search conversations or @username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="filter-tabs-row">
          <button
            type="button"
            className={`filter-tab-chip ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`filter-tab-chip ${activeFilter === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveFilter('unread')}
          >
            Unread
          </button>
          <button
            type="button"
            className={`filter-tab-chip ${activeFilter === 'direct' ? 'active' : ''}`}
            onClick={() => setActiveFilter('direct')}
          >
            Direct Mesh
          </button>
        </div>

        {/* Chat Stream List */}
        <div className="sidebar-chat-stream">
          {conversations
            .filter((c) => {
              if (activeFilter === 'unread' && c.unreadCount === 0) return false;
              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const peerId = c.participantIds.find((id) => id !== profile?.id);
                const contact = contacts.find((ct) => ct.id === peerId);
                const name = (contact?.displayName || c.name || '').toLowerCase();
                const u = (contact?.username || '').toLowerCase();
                const snippet = (c.lastMessageSnippet || '').toLowerCase();
                return name.includes(q) || u.includes(q) || snippet.includes(q);
              }
              return true;
            })
            .map((conv) => {
              const peerId = conv.participantIds.find((id) => id !== profile?.id);
              const contact = contacts.find((c) => c.id === peerId);
              const name = contact?.displayName || conv.name || 'Contact';
              const isSelected = activeConversationId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`chat-card-lux ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    loadMessages(conv.id);
                  }}
                >
                  <div className="chat-avatar-squircle online">
                    {name.charAt(0).toUpperCase()}
                  </div>

                  <div className="chat-card-body">
                    <div className="chat-card-row-top">
                      <span className="chat-card-title">
                        {name}
                        {contact?.username && (
                          <span className="chat-card-username">@{contact.username}</span>
                        )}
                      </span>
                      <span className="chat-card-timestamp">
                        {new Date(conv.lastMessageTimestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="chat-card-row-bottom">
                      <span className="chat-card-snippet-text">
                        <CheckCheck size={14} color="var(--accent-light)" style={{ flexShrink: 0 }} />
                        {conv.lastMessageSnippet}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {conv.unreadCount > 0 && (
                          <span className="chat-unread-pill">{conv.unreadCount}</span>
                        )}
                        <button
                          type="button"
                          className="chat-card-delete-hover"
                          title="Delete Entire Chat"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteConversation(conv.id);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </aside>

      {/* ==========================================================================
          RIGHT MAIN PANEL: Active Conversation or Shongjog Welcome Viewport
          ========================================================================== */}
      <main className="shongjog-main-viewport">
        {activeConversationId ? (
          <>
            {/* Active Conversation Topbar */}
            <div className="main-chat-topbar">
              <div
                className="peer-profile-cluster"
                onClick={() => setShowPeerDetails(!showPeerDetails)}
                title="View Contact & Chat Details"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveConversationId(null);
                  }}
                  style={{ display: 'none', marginRight: 4 }}
                  className="mobile-back-btn"
                >
                  <ArrowLeft size={20} />
                </button>

                <div className="peer-avatar-squircle">
                  {activeChatName.charAt(0).toUpperCase()}
                </div>

                <div>
                  <div className="peer-title-text">
                    {activeChatName}
                    {activeContact?.username && (
                      <span className="peer-handle-badge">@{activeContact.username}</span>
                    )}
                  </div>
                  <div className="peer-connectivity-status">
                    <span
                      className="pulse-beacon-dot"
                      style={{
                        backgroundColor: isOnline ? 'var(--accent-main)' : '#fbbf24',
                        boxShadow: isOnline ? '0 0 8px var(--accent-main)' : '0 0 8px #fbbf24',
                      }}
                    />
                    {isOnline ? 'Online Mesh Active' : 'Offline Direct Mesh'}
                  </div>
                </div>
              </div>

              <div className="chat-topbar-tools">
                {/* In-Chat Search Button */}
                <button
                  type="button"
                  className="icon-button-lux"
                  onClick={() => setShowInChatSearch(!showInChatSearch)}
                  title="Search inside this chat"
                >
                  <Search size={18} />
                </button>

                {/* Direct Voice Call */}
                <button
                  type="button"
                  className="topbar-call-button"
                  onClick={handleStartCall}
                  title="Direct Voice Call"
                >
                  <Phone size={19} />
                </button>

                {/* Info / Options */}
                <button
                  type="button"
                  className="icon-button-lux"
                  onClick={() => setShowPeerDetails(!showPeerDetails)}
                  title="Chat Details & Clear History"
                >
                  <Info size={18} />
                </button>

                {/* Delete Full Chat */}
                <button
                  type="button"
                  className="icon-button-lux"
                  onClick={() => activeConversationId && handleDeleteConversation(activeConversationId)}
                  title="Delete Entire Chat"
                  style={{ color: 'var(--rose-danger)' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* In-Chat Search Tray */}
            {showInChatSearch && (
              <div className="in-chat-search-tray">
                <Search size={16} color="var(--accent-light)" />
                <input
                  type="text"
                  placeholder="Search messages in this conversation..."
                  value={inChatSearchQuery}
                  autoFocus
                  onChange={(e) => setInChatSearchQuery(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowInChatSearch(false);
                    setInChatSearchQuery('');
                  }}
                  style={{ color: '#94a3b8' }}
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="messages-stream-container">
              <div className="encryption-security-ribbon">
                <ShieldCheck size={14} color="var(--accent-light)" />
                End-to-End Encrypted • {isOnline ? 'Auto-Sync Active' : 'Air-Gapped Direct P2P'}
              </div>

              {displayedMessages.map((msg) => {
                const isOutgoing = msg.senderId === profile?.id;

                return (
                  <div
                    key={msg.id}
                    className={`bubble-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
                  >
                    {/* Hover Reaction & Actions Dock */}
                    <div className="msg-hover-action-dock">
                      {['❤️', '👍', '😂', '🔥', '😮', '🙏'].map((emoji) => (
                        <span
                          key={emoji}
                          className="reaction-dock-emoji"
                          onClick={() => handleReactToMessage(msg.id, emoji)}
                          title={`React with ${emoji}`}
                        >
                          {emoji}
                        </span>
                      ))}
                      <button
                        type="button"
                        className="action-dock-btn"
                        onClick={() => handleCopyMessage(msg.content)}
                        title="Copy Text"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        type="button"
                        className="action-dock-btn"
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Delete Message"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className={`chat-bubble-shell ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                      {msg.type === 'text' && <div>{msg.content}</div>}

                      {msg.type === 'voice' && (
                        <VoiceBubble
                          blobKey={msg.media?.blobKey}
                          mediaUrl={msg.media?.url}
                          durationSeconds={msg.media?.durationSeconds}
                          waveform={msg.media?.waveform}
                          isOutgoing={isOutgoing}
                        />
                      )}

                      {msg.type === 'file' && (
                        <div className="file-attachment-card">
                          <div className="file-icon-box">
                            <FileText size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>
                              {msg.media?.fileName || 'Document'}
                            </div>
                            <div style={{ fontSize: '11px', opacity: 0.75 }}>
                              {msg.media?.fileSize
                                ? `${Math.round(msg.media.fileSize / 1024)} KB`
                                : 'Attachment'}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bubble-meta-info">
                        <span>
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isOutgoing && (
                          <span>
                            {msg.status === 'read' ? (
                              <CheckCheck size={14} color="var(--accent-light)" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck size={14} color="#94a3b8" />
                            ) : msg.status === 'sending' ? (
                              <Clock size={12} color="#94a3b8" />
                            ) : (
                              <Check size={14} color="#94a3b8" />
                            )}
                          </span>
                        )}

                        {/* Three-Line / Three-Dot Menu Options */}
                        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="bubble-context-trigger"
                            title="Message Options"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuMsgId((prev) => (prev === msg.id ? null : msg.id));
                            }}
                          >
                            <MoreVertical size={13} />
                          </button>

                          {activeMenuMsgId === msg.id && (
                            <div
                              className="bubble-context-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 4,
                                  padding: '4px 6px 6px',
                                  borderBottom: '1px solid var(--border-glass)',
                                  justifyContent: 'space-between',
                                }}
                              >
                                {['❤️', '👍', '😂', '🔥', '😮', '🙏'].map((emoji) => (
                                  <span
                                    key={emoji}
                                    style={{ cursor: 'pointer', fontSize: '15px' }}
                                    onClick={() => {
                                      handleReactToMessage(msg.id, emoji);
                                      setActiveMenuMsgId(null);
                                    }}
                                  >
                                    {emoji}
                                  </span>
                                ))}
                              </div>

                              <button
                                type="button"
                                className="context-menu-item"
                                onClick={() => {
                                  handleCopyMessage(msg.content);
                                  setActiveMenuMsgId(null);
                                }}
                              >
                                <Copy size={13} />
                                <span>Copy Text</span>
                              </button>

                              <button
                                type="button"
                                className="context-menu-item danger"
                                onClick={() => {
                                  handleDeleteMessage(msg.id);
                                  setActiveMenuMsgId(null);
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Delete Message</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Reactions Pill Display Under Bubble */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className="bubble-reactions-cluster">
                        {Object.entries(msg.reactions).map(([emoji, count]) => (
                          <div
                            key={emoji}
                            className="reaction-pill-badge"
                            onClick={() => handleReactToMessage(msg.id, emoji)}
                          >
                            <span>{emoji}</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom Input Bar */}
            <form className="chat-bottom-input-bar" onSubmit={handleSendMessage}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelected}
              />

              <button
                type="button"
                className="icon-button-lux"
                title="Attach Document"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={19} />
              </button>

              <input
                type="text"
                className="message-type-input"
                placeholder={isRecordingVoice ? `Recording voice (${recordingSeconds}s)...` : 'Type a message...'}
                value={inputText}
                disabled={isRecordingVoice}
                onChange={(e) => setInputText(e.target.value)}
              />

              {inputText.trim() ? (
                <button type="submit" className="send-message-action" title="Send message">
                  <Send size={19} />
                </button>
              ) : (
                <button
                  type="button"
                  className={`record-mic-action ${isRecordingVoice ? 'recording' : ''}`}
                  onClick={handleToggleVoiceRecord}
                  title={isRecordingVoice ? 'Stop and send' : 'Record voice note'}
                >
                  <Mic size={20} />
                </button>
              )}
            </form>

            {/* Peer Details & Chat Modification Drawer */}
            {showPeerDetails && (
              <div className="peer-details-drawer">
                <div className="peer-details-header">
                  <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Contact Info</h3>
                  <button type="button" onClick={() => setShowPeerDetails(false)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="peer-details-body">
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div
                      style={{
                        width: 78,
                        height: 78,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--brand-orb-grad)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '32px',
                        color: 'white',
                        fontWeight: 700,
                        margin: '0 auto 12px',
                        boxShadow: '0 8px 24px var(--accent-glow)',
                      }}
                    >
                      {activeChatName.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '18px', fontWeight: 600, color: 'white' }}>
                      {activeChatName}
                    </div>
                    {activeContact?.username && (
                      <div style={{ fontSize: '13px', color: 'var(--accent-light)', marginTop: 2 }}>
                        @{activeContact.username}
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: 4 }}>
                      {activeContact?.phoneNumber || 'Direct Peer'}
                    </div>
                  </div>

                  {/* Actions List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                      type="button"
                      className="peer-action-card-btn"
                      onClick={() => {
                        setShowInChatSearch(true);
                        setShowPeerDetails(false);
                      }}
                    >
                      <Search size={16} />
                      <span>Search in Conversation</span>
                    </button>

                    <button
                      type="button"
                      className="peer-action-card-btn"
                      onClick={handleStartCall}
                    >
                      <Phone size={16} />
                      <span>Start Audio Call</span>
                    </button>

                    <button
                      type="button"
                      className="peer-action-card-btn danger"
                      onClick={handleClearChatHistory}
                    >
                      <Trash2 size={16} />
                      <span>Clear Chat History</span>
                    </button>

                    <button
                      type="button"
                      className="peer-action-card-btn danger"
                      onClick={() => activeConversationId && handleDeleteConversation(activeConversationId)}
                    >
                      <Trash2 size={16} />
                      <span>Delete Entire Conversation</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* ==========================================================================
             EXECUTIVE SHONGJOG WELCOME VIEWPORT (When no chat is active)
             ========================================================================== */
          <div className="shongjog-welcome-view">
            <div className="welcome-floating-badge">
              <Radio size={44} color="var(--accent-light)" />
            </div>

            <h1 className="welcome-title-primary">
              Shongjog <span style={{ fontFamily: 'var(--font-bangla)', color: 'var(--accent-light)', fontSize: '26px' }}>সংযোগ</span>
            </h1>
            <p className="welcome-desc-paragraph">
              Next-generation direct communication network with dedicated @usernames. Send messages, voice notes, and make real-time audio calls directly across devices with hardware-grade cryptographic privacy.
            </p>

            <div className="welcome-security-capsule">
              <ShieldCheck size={16} />
              End-to-End Encrypted • {isOnline ? 'Live Mesh' : 'Air-Gapped Offline Mesh'}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
