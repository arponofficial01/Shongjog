import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquarePlus,
  MoreVertical,
  Search,
  Phone,
  Video,
  Paperclip,
  Smile,
  Mic,
  Send,
  Check,
  CheckCheck,
  Clock,
  ArrowLeft,
  Lock,
  FileText,
  CircleDashed,
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
  // --- User Profile & Navigation ---
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Data Collections
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  // Drawers & Modals
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showNewContactDrawer, setShowNewContactDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'groups'>('all');

  // Input & Messaging State
  const [inputText, setInputText] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Calling State
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);

  // Refs
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Initial App Load
  useEffect(() => {
    async function initApp() {
      TransportManager.init();

      // Listen for incoming call sessions
      const callMgr = CallManager.getInstance();
      callMgr.onSessionChange = (session) => {
        setActiveCallSession(session);
      };

      // Load active profile
      const user = await IdentityService.getActiveProfile();
      if (user) {
        setProfile(user);
        await loadUserData(user.id);
      }
      setIsInitializing(false);
    }

    initApp();
  }, []);

  // 2. Load contacts and conversations from IndexedDB
  const loadUserData = async (_userId?: string) => {
    const db = await getDatabase();
    let storedContacts = await db.getAll('contacts');

    // If fresh install with 0 contacts, add friendly demo contacts so user immediately sees WhatsApp chats
    if (storedContacts.length === 0) {
      const demoContacts: Contact[] = [
        {
          id: 'demo_1',
          phoneNumber: '+880 1712 345678',
          displayName: 'Tanvir Ahmed',
          username: 'tanvir_bd',
          isBlocked: false,
          lastSeen: Date.now() - 1000 * 60 * 5,
        },
        {
          id: 'demo_2',
          phoneNumber: '+880 1819 876543',
          displayName: 'Nusrat Jahan',
          username: 'nusrat_j',
          isBlocked: false,
          lastSeen: Date.now() - 1000 * 60 * 30,
        },
        {
          id: 'demo_3',
          phoneNumber: '+880 1911 223344',
          displayName: 'Dhaka Tech Group',
          username: 'dhaka_tech',
          isBlocked: false,
          lastSeen: Date.now() - 1000 * 60 * 120,
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
          lastMessageSnippet: 'Assalamu Alaikum! Are you free for a quick call?',
          lastMessageTimestamp: Date.now() - 1000 * 60 * 5,
          unreadCount: 1,
          updatedAt: Date.now() - 1000 * 60 * 5,
        },
        {
          id: 'conv_2',
          type: 'direct',
          participantIds: [_userId || '', storedContacts[1].id],
          lastMessageSnippet: '🎙️ Voice message (0:14)',
          lastMessageTimestamp: Date.now() - 1000 * 60 * 45,
          unreadCount: 0,
          updatedAt: Date.now() - 1000 * 60 * 45,
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

    // Initial starter messages if fresh
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
          content: 'Assalamu Alaikum! Are you free for a quick call?',
          timestamp: Date.now() - 1000 * 60 * 10,
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

  // 3. Send Text Message
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
      // Stop and send voice message
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
      // Start recording
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

  // 6. Voice Audio Calling
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

  // Active Peer Info
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activePeerId = activeConversation?.participantIds.find((id) => id !== profile?.id);
  const activeContact = contacts.find((c) => c.id === activePeerId);
  const activeChatName = activeContact?.displayName || 'Chat';

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111b21', color: '#00a884' }}>
        <div style={{ fontSize: '18px', fontWeight: 500 }}>WhatsApp Web</div>
      </div>
    );
  }

  return (
    <div className={`whatsapp-app ${activeConversationId ? 'chat-open' : ''}`}>
      {/* Profile Setup Modal on first visit */}
      {!profile && (
        <ProfileSetupModal
          onProfileCreated={(newProfile) => {
            setProfile(newProfile);
            loadUserData(newProfile.id);
          }}
        />
      )}

      {/* WhatsApp Voice Call Screen */}
      {activeCallSession && profile && (
        <AudioCallModal session={activeCallSession} localUserId={profile.id} />
      )}

      {/* ==========================================================================
          LEFT SIDEBAR (Chats List, Search, WhatsApp Drawer Panels)
          ========================================================================== */}
      <aside className="wa-sidebar">
        {/* Settings Drawer */}
        {showSettingsDrawer && profile && (
          <SettingsPanel
            profile={profile}
            onBack={() => setShowSettingsDrawer(false)}
            onProfileReset={() => {
              IdentityService.logout();
              setProfile(null);
            }}
          />
        )}

        {/* New Contact Drawer */}
        {showNewContactDrawer && (
          <ContactModal
            onClose={() => setShowNewContactDrawer(false)}
            onContactSaved={(contact) => {
              setContacts((prev) => [contact, ...prev]);
              // Start chat with new contact
              const newConv: Conversation = {
                id: crypto.randomUUID(),
                type: 'direct',
                participantIds: [profile?.id || '', contact.id],
                lastMessageSnippet: 'Chat started',
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

        {/* Sidebar Header */}
        <div className="wa-sidebar-header">
          <div
            className="wa-header-avatar"
            onClick={() => setShowSettingsDrawer(true)}
            title="Profile & Settings"
          >
            {profile?.displayName.charAt(0).toUpperCase() || 'U'}
          </div>

          <div className="wa-header-icons">
            <button
              type="button"
              className="wa-icon-btn"
              title="Status"
            >
              <CircleDashed size={20} />
            </button>
            <button
              type="button"
              className="wa-icon-btn"
              onClick={() => setShowNewContactDrawer(true)}
              title="New Chat"
            >
              <MessageSquarePlus size={20} />
            </button>
            <button
              type="button"
              className="wa-icon-btn"
              onClick={() => setShowSettingsDrawer(true)}
              title="Menu"
            >
              <MoreVertical size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar & Filter Chips */}
        <div className="wa-search-container">
          <div className="wa-search-bar">
            <Search size={18} color="#8696a0" />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="wa-filter-chips">
            <button
              type="button"
              className={`wa-chip ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`wa-chip ${activeFilter === 'unread' ? 'active' : ''}`}
              onClick={() => setActiveFilter('unread')}
            >
              Unread
            </button>
            <button
              type="button"
              className={`wa-chip ${activeFilter === 'groups' ? 'active' : ''}`}
              onClick={() => setActiveFilter('groups')}
            >
              Groups
            </button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="wa-chat-list">
          {conversations
            .filter((c) => {
              if (activeFilter === 'unread') return c.unreadCount > 0;
              if (activeFilter === 'groups') return c.type === 'group';
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
                  className={`wa-chat-item ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    loadMessages(conv.id);
                  }}
                >
                  <div className="wa-chat-avatar online">
                    {name.charAt(0).toUpperCase()}
                  </div>

                  <div className="wa-chat-content">
                    <div className="wa-chat-top-row">
                      <span className="wa-chat-name">{name}</span>
                      <span className={`wa-chat-time ${conv.unreadCount > 0 ? 'unread' : ''}`}>
                        {new Date(conv.lastMessageTimestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="wa-chat-bottom-row">
                      <span className="wa-chat-snippet">
                        <CheckCheck size={16} color="#53bdeb" style={{ flexShrink: 0 }} />
                        {conv.lastMessageSnippet}
                      </span>

                      {conv.unreadCount > 0 && (
                        <span className="wa-unread-badge">{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </aside>

      {/* ==========================================================================
          RIGHT MAIN PANEL (Active Conversation or WhatsApp Welcome Screen)
          ========================================================================== */}
      <main className="wa-main-panel">
        <div className="wa-chat-wallpaper" />

        {activeConversationId ? (
          <>
            {/* Conversation Header */}
            <div className="wa-chat-header">
              <div className="wa-contact-header-info">
                <button
                  type="button"
                  onClick={() => setActiveConversationId(null)}
                  style={{ display: 'none', marginRight: 4 }}
                  className="mobile-back-btn"
                >
                  <ArrowLeft size={20} />
                </button>

                <div className="wa-header-avatar" style={{ width: 40, height: 40 }}>
                  {activeChatName.charAt(0).toUpperCase()}
                </div>

                <div className="wa-contact-header-text">
                  <div className="wa-contact-header-name">{activeChatName}</div>
                  <div className="wa-contact-header-status">online</div>
                </div>
              </div>

              <div className="wa-chat-header-actions">
                <button
                  type="button"
                  className="wa-icon-btn"
                  onClick={handleStartCall}
                  title="Voice Call"
                >
                  <Phone size={20} />
                </button>
                <button
                  type="button"
                  className="wa-icon-btn"
                  title="Video Call"
                >
                  <Video size={21} />
                </button>
                <button
                  type="button"
                  className="wa-icon-btn"
                  title="Search in chat"
                >
                  <Search size={20} />
                </button>
                <button
                  type="button"
                  className="wa-icon-btn"
                  title="Menu"
                >
                  <MoreVertical size={20} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="wa-messages-container">
              {/* WhatsApp End-to-End Encryption Banner */}
              <div className="wa-system-notice">
                <Lock size={12} />
                Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.
              </div>

              {messages.map((msg) => {
                const isOutgoing = msg.senderId === profile?.id;

                return (
                  <div
                    key={msg.id}
                    className={`wa-message-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
                  >
                    <div className={`wa-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                      {msg.type === 'text' && (
                        <div className="wa-bubble-text">{msg.content}</div>
                      )}

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
                        <div className="wa-file-bubble">
                          <div className="wa-file-icon-box">
                            <FileText size={20} />
                          </div>
                          <div>
                            <div className="wa-file-name">{msg.media?.fileName || 'Document'}</div>
                            <div className="wa-file-size">
                              {msg.media?.fileSize
                                ? `${Math.round(msg.media.fileSize / 1024)} KB`
                                : 'Attachment'}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="wa-bubble-meta">
                        <span className="wa-bubble-time">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {isOutgoing && (
                          <span>
                            {msg.status === 'read' ? (
                              <CheckCheck size={16} color="#53bdeb" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck size={16} color="#8696a0" />
                            ) : msg.status === 'sending' ? (
                              <Clock size={12} color="#8696a0" />
                            ) : (
                              <Check size={16} color="#8696a0" />
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

            {/* Bottom Message Input Bar */}
            <form className="wa-input-bar" onSubmit={handleSendMessage}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileSelected}
              />

              <button type="button" className="wa-icon-btn" title="Emoji">
                <Smile size={24} />
              </button>

              <button
                type="button"
                className="wa-icon-btn"
                title="Attach"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={24} />
              </button>

              <input
                type="text"
                className="wa-message-input"
                placeholder={isRecordingVoice ? `Recording voice (${recordingSeconds}s)...` : 'Type a message'}
                value={inputText}
                disabled={isRecordingVoice}
                onChange={(e) => setInputText(e.target.value)}
              />

              {inputText.trim() ? (
                <button type="submit" className="wa-send-btn" title="Send">
                  <Send size={24} />
                </button>
              ) : (
                <button
                  type="button"
                  className={`wa-mic-btn ${isRecordingVoice ? 'recording' : ''}`}
                  onClick={handleToggleVoiceRecord}
                  title={isRecordingVoice ? 'Stop and send' : 'Voice message'}
                >
                  <Mic size={24} />
                </button>
              )}
            </form>
          </>
        ) : (
          /* ==========================================================================
             WHATSAPP WEB WELCOME SCREEN (When no chat is selected)
             ========================================================================== */
          <div className="wa-welcome-screen">
            <svg
              viewBox="0 0 300 180"
              className="wa-welcome-graphic"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="50" y="20" width="200" height="120" rx="12" fill="#202c33" />
              <rect x="62" y="32" width="176" height="96" rx="6" fill="#111b21" />
              <circle cx="150" cy="80" r="28" fill="#00a884" opacity="0.2" />
              <path
                d="M150 64c-8.8 0-16 7.2-16 16 0 2.8.7 5.5 2.1 7.9l-2.2 8.1 8.3-2.2c2.3 1.3 4.9 2.2 7.8 2.2 8.8 0 16-7.2 16-16s-7.2-16-16-16z"
                fill="#00a884"
              />
              <rect x="30" y="142" width="240" height="8" rx="4" fill="#2a3942" />
            </svg>

            <h1 className="wa-welcome-title">WhatsApp Web</h1>
            <p className="wa-welcome-desc">
              Send and receive messages without keeping your phone online.<br />
              Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
            </p>

            <div className="wa-welcome-lock">
              <Lock size={14} />
              End-to-end encrypted
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
