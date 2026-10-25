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
import { CallManager } from './services/call/callManager';
import type { ActiveCallSession } from './services/call/callManager';
import { VoiceRecorder } from './services/media/voiceRecorder';
import { FileTransferService } from './services/media/fileTransferService';

import { VoiceBubble } from './components/VoiceBubble';
import { AudioCallModal } from './components/AudioCallModal';
import { ContactModal } from './components/ContactModal';
import { SettingsPanel } from './components/SettingsPanel';
import { ProfileSetupModal } from './components/ProfileSetupModal';

export const App: React.FC = () => {
  // --- Profile & Navigation State ---
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [, setLangTick] = useState(0);

  // Collections
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Drawers
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showNewContactDrawer, setShowNewContactDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'direct'>('all');

  // Messaging Input
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Audio Call
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);

  // Refs
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. App Startup
  useEffect(() => {
    async function initApp() {
      TransportManager.init();

      const callMgr = CallManager.getInstance();
      callMgr.onSessionChange = (session) => {
        setActiveCallSession(session);
      };

      const user = await IdentityService.getActiveProfile();
      if (user) {
        setProfile(user);
        await loadUserData(user.id);
      }
      setIsInitializing(false);
    }

    initApp();
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
          content: 'Assalamu Alaikum! Welcome to Shongjog (সংযোগ). Send a voice note or start a direct call!',
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
      transport: 'internet_supabase',
    };

    setInputText('');
    setMessages((prev) => [...prev, newMsg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    await TransportManager.dispatchMessage(newMsg, peerId);
    await loadUserData(profile.id);
  };

  // 4. Voice Note Recording
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
            durationSeconds: result.durationSeconds,
            waveform: result.waveform,
            mimeType: result.mimeType,
          },
          timestamp: Date.now(),
          status: 'sending',
          transport: 'internet_supabase',
        };

        setMessages((prev) => [...prev, voiceMsg]);
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

  // 5. Send File
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
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
      timestamp: Date.now(),
      status: 'sending',
      transport: 'internet_supabase',
    };

    setMessages((prev) => [...prev, fileMsg]);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    await TransportManager.dispatchMessage(fileMsg, peerId);
    await loadUserData(profile.id);
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
        'direct_webrtc_lan'
      );
    } catch (err: any) {
      alert(err.message || 'Cannot start audio call');
    }
  };

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activePeerId = activeConversation?.participantIds.find((id) => id !== profile?.id);
  const activeContact = contacts.find((c) => c.id === activePeerId);
  const activeChatName = activeContact?.displayName || 'Conversation';

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
        {/* Settings Drawer */}
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
            title="Profile & Settings"
          >
            <div className="brand-logo-orb">
              <Radio size={22} />
            </div>
            <div className="brand-meta-column">
              <div className="brand-main-title">
                Shongjog
                <span className="brand-bengali-script">সংযোগ</span>
              </div>
              <span className="brand-tagline-text">DIRECT MESH</span>
            </div>
          </div>

          <div className="header-tools-cluster">
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
              title="Settings"
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
                        <CheckCheck size={14} color="#34d399" style={{ flexShrink: 0 }} />
                        {conv.lastMessageSnippet}
                      </span>

                      {conv.unreadCount > 0 && (
                        <span className="chat-unread-pill">{conv.unreadCount}</span>
                      )}
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
              <div className="peer-profile-cluster">
                <button
                  type="button"
                  onClick={() => setActiveConversationId(null)}
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
                    <span className="pulse-beacon-dot" />
                    Direct Mesh Active
                  </div>
                </div>
              </div>

              <div className="chat-topbar-tools">
                <button
                  type="button"
                  className="topbar-call-button"
                  onClick={handleStartCall}
                  title="Direct Voice Call"
                >
                  <Phone size={19} />
                </button>
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="messages-stream-container">
              <div className="encryption-security-ribbon">
                <ShieldCheck size={14} color="#10b981" />
                End-to-End Encrypted Direct Connection
              </div>

              {messages.map((msg) => {
                const isOutgoing = msg.senderId === profile?.id;

                return (
                  <div
                    key={msg.id}
                    className={`bubble-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
                  >
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
                              <CheckCheck size={14} color="#34d399" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck size={14} color="#94a3b8" />
                            ) : msg.status === 'sending' ? (
                              <Clock size={12} color="#94a3b8" />
                            ) : (
                              <Check size={14} color="#94a3b8" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
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
          </>
        ) : (
          /* ==========================================================================
             EXECUTIVE SHONGJOG WELCOME VIEWPORT (When no chat is active)
             ========================================================================== */
          <div className="shongjog-welcome-view">
            <div className="welcome-floating-badge">
              <Radio size={44} color="#10b981" />
            </div>

            <h1 className="welcome-title-primary">
              Shongjog <span style={{ fontFamily: 'var(--font-bangla)', color: 'var(--emerald-light)', fontSize: '26px' }}>সংযোগ</span>
            </h1>
            <p className="welcome-desc-paragraph">
              Next-generation direct communication network with unique @usernames. Send messages, voice notes, and make real-time audio calls directly across devices with hardware-grade cryptographic privacy.
            </p>

            <div className="welcome-security-capsule">
              <ShieldCheck size={16} />
              End-to-End Encrypted • Hardware Cryptographic Keys
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
