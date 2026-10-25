import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Users,
  Wifi,
  Phone,
  Settings,
  Send,
  Mic,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Zap,
  Radio,
  FileText,
  Check,
  CheckCheck,
  Clock,
  ArrowLeft,
} from 'lucide-react';

import { getDatabase } from './services/db/database';
import type {
  UserProfile,
  Contact,
  Conversation,
  Message,
  CallLog,
} from './services/db/database';
import { IdentityService } from './services/identity/identityService';
import { TransportManager } from './services/transport/transportManager';
import type { TransportStatus } from './services/transport/transportManager';
import { WebRTCService } from './services/transport/webrtcService';
import { CallManager } from './services/call/callManager';
import type { ActiveCallSession } from './services/call/callManager';
import { VoiceRecorder } from './services/media/voiceRecorder';
import { FileTransferService } from './services/media/fileTransferService';
import { SyncEngine } from './services/sync/syncEngine';

import { VoiceBubble } from './components/VoiceBubble';
import { AudioCallModal } from './components/AudioCallModal';
import { OfflinePairingModal } from './components/OfflinePairingModal';
import { ContactModal } from './components/ContactModal';
import { SettingsPanel } from './components/SettingsPanel';
import { ProfileSetupModal } from './components/ProfileSetupModal';

import { t, getLanguage } from './i18n/translations';
import type { SupportedLanguage } from './i18n/translations';

export const App: React.FC = () => {
  // --- Core Application State ---
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts' | 'callLogs' | 'settings'>('chats');
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getLanguage());

  // Data Collections
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);

  // Transports & Connectivity
  const [transportStatus, setTransportStatus] = useState<TransportStatus>({
    isOnlineInternet: navigator.onLine,
    isDirectLanActive: false,
    connectedPeersCount: 0,
    activeTransport: 'offline_queued',
    supabaseConfigured: false,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingOutboxCount, setPendingOutboxCount] = useState(0);

  // Calling & Media State
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [fileTransferProgress, setFileTransferProgress] = useState<{ name: string; percent: number } | null>(null);

  // Input & Modals
  const [inputText, setInputText] = useState('');
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Refs
  const voiceRecorderRef = useRef<VoiceRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Initial Load & Services Bootstrapping
  useEffect(() => {
    async function boot() {
      TransportManager.init();

      // Listen for transport state changes
      TransportManager.onStatusChange((status) => {
        setTransportStatus(status);
      });

      // Listen for call session changes
      const callMgr = CallManager.getInstance();
      callMgr.onSessionChange = (session) => {
        setActiveCallSession(session);
        if (session && session.state === 'ended') {
          loadCallLogs();
        }
      };

      // Listen for sync status changes
      SyncEngine.onSyncStatusChange = (syncing, pending) => {
        setIsSyncing(syncing);
        setPendingOutboxCount(pending);
      };

      // Load active user profile
      const user = await IdentityService.getActiveProfile();
      if (user) {
        setProfile(user);
        await refreshUserData(user.id);
      }
      setIsInitializing(false);
    }

    boot();
  }, []);

  // 2. Refresh lists from IndexedDB
  const refreshUserData = async (_userId?: string) => {
    const db = await getDatabase();
    const storedContacts = await db.getAll('contacts');
    setContacts(storedContacts);

    const storedConversations = await db.getAll('conversations');
    // Sort latest first
    storedConversations.sort((a, b) => b.updatedAt - a.updatedAt);
    setConversations(storedConversations);

    const storedCalls = await db.getAll('callLogs');
    storedCalls.sort((a, b) => b.timestamp - a.timestamp);
    setCallLogs(storedCalls);

    const outboxCount = await SyncEngine.getPendingOutboxCount();
    setPendingOutboxCount(outboxCount);

    // If there's an active conversation, reload messages
    if (activeConversationId) {
      loadMessagesForConversation(activeConversationId);
    }
  };

  const loadMessagesForConversation = async (convId: string) => {
    const db = await getDatabase();
    const all = await db.getAllFromIndex('messages', 'by-conversation', convId);
    all.sort((a, b) => a.timestamp - b.timestamp);
    setMessages(all);
    scrollToBottom();
  };

  const loadCallLogs = async () => {
    const db = await getDatabase();
    const storedCalls = await db.getAll('callLogs');
    storedCalls.sort((a, b) => b.timestamp - a.timestamp);
    setCallLogs(storedCalls);
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 3. Setup incoming message / file listener across DataChannel and BroadcastChannel
  useEffect(() => {
    if (!profile) return;

    const setupBroadcastListener = () => {
      try {
        const bc = new BroadcastChannel('offline_mesh_signaling');
        bc.onmessage = async (event) => {
          const data = event.data;
          if (data.protocol === 'chat_message' && data.message) {
            const incoming: Message = data.message;
            if (incoming.recipientId === profile.id || incoming.senderId !== profile.id) {
              const db = await getDatabase();
              incoming.status = 'delivered';
              incoming.isDeliveredDirectOffline = true;
              await db.put('messages', incoming);

              if (activeConversationId === incoming.conversationId) {
                setMessages((prev) => [...prev, incoming]);
                scrollToBottom();
              }
              refreshUserData(profile.id);
            }
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error', err);
      }
    };

    setupBroadcastListener();
  }, [profile, activeConversationId]);

  // 4. Send Text Message
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
      transport: transportStatus.activeTransport,
    };

    setInputText('');
    setMessages((prev) => [...prev, newMsg]);
    scrollToBottom();

    // Dispatch message via optimal transport
    await TransportManager.dispatchMessage(newMsg, peerId);
    await refreshUserData(profile.id);
  };

  // 5. Voice Recording Handler
  const handleToggleVoiceRecord = async () => {
    if (isRecordingVoice) {
      // Stop and send voice note
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
          content: '🎙️ Voice note',
          media: {
            blobKey: result.blobKey,
            durationSeconds: result.durationSeconds,
            waveform: result.waveform,
            mimeType: result.mimeType,
          },
          timestamp: Date.now(),
          status: 'sending',
          transport: transportStatus.activeTransport,
        };

        setMessages((prev) => [...prev, voiceMsg]);
        scrollToBottom();

        await TransportManager.dispatchMessage(voiceMsg, peerId);
        await refreshUserData(profile.id);
      } catch (e) {
        console.error('Error saving voice recording', e);
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
        alert('Microphone access is required to record voice messages.');
      }
    }
  };

  // 6. Direct File Transfer Handler
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile || !activeConversationId) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const peerId = activeConv?.participantIds.find((id) => id !== profile.id);

    setFileTransferProgress({ name: file.name, percent: 1 });

    const rtc = peerId ? WebRTCService.getInstance(profile.id, peerId) : null;
    let blobKey = 'file_' + crypto.randomUUID();

    if (rtc && peerId && TransportManager.isPeerDirectlyConnected(peerId)) {
      await FileTransferService.sendFileDirect(file, file.name, rtc, (percent) => {
        setFileTransferProgress({ name: file.name, percent });
      });
    }

    setFileTransferProgress(null);

    const fileMsg: Message = {
      id: crypto.randomUUID(),
      conversationId: activeConversationId,
      senderId: profile.id,
      senderDeviceId: profile.deviceId,
      recipientId: peerId,
      type: 'file',
      content: `📎 ${file.name}`,
      media: {
        blobKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
      timestamp: Date.now(),
      status: 'sending',
      transport: transportStatus.activeTransport,
    };

    setMessages((prev) => [...prev, fileMsg]);
    scrollToBottom();

    await TransportManager.dispatchMessage(fileMsg, peerId);
    await refreshUserData(profile.id);
  };

  // 7. Initiate Audio Call
  const handleStartAudioCall = async () => {
    if (!profile || !activeConversationId) return;

    const activeConv = conversations.find((c) => c.id === activeConversationId);
    const peerId = activeConv?.participantIds.find((id) => id !== profile.id);
    if (!peerId) return;

    const peerContact = contacts.find((c) => c.id === peerId);
    const peerName = peerContact?.displayName || 'Peer Contact';
    const peerPhone = peerContact?.phoneNumber;

    try {
      await CallManager.getInstance().startOutgoingCall(
        profile.id,
        profile.displayName,
        peerId,
        peerName,
        peerPhone,
        transportStatus.activeTransport
      );
    } catch (err: any) {
      alert(err.message || 'Cannot start audio call');
    }
  };

  // 8. Open or Create Conversation with Contact
  const handleStartChatWithContact = async (contact: Contact) => {
    if (!profile) return;
    const db = await getDatabase();

    // Check if conversation already exists
    let existingConv = conversations.find(
      (c) => c.participantIds.includes(contact.id) && c.type === 'direct'
    );

    if (!existingConv) {
      existingConv = {
        id: crypto.randomUUID(),
        type: 'direct',
        participantIds: [profile.id, contact.id],
        lastMessageSnippet: 'Conversation started',
        lastMessageTimestamp: Date.now(),
        unreadCount: 0,
        updatedAt: Date.now(),
      };
      await db.put('conversations', existingConv);
      setConversations((prev) => [existingConv!, ...prev]);
    }

    setActiveConversationId(existingConv.id);
    setActiveTab('chats');
    loadMessagesForConversation(existingConv.id);
  };

  // Active peer info for chat header
  const currentConversation = conversations.find((c) => c.id === activeConversationId);
  const currentPeerId = currentConversation?.participantIds.find((id) => id !== profile?.id);
  const currentPeerContact = contacts.find((c) => c.id === currentPeerId);
  const currentPeerName = currentPeerContact?.displayName || 'Peer Contact';
  const isPeerOnlineDirect = currentPeerId ? TransportManager.isPeerDirectlyConnected(currentPeerId) : false;

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#070a12', color: '#10b981' }}>
        <RefreshCw className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="app-container" key={currentLang}>
      {/* Profile Onboarding Modal if not configured */}
      {!profile && (
        <ProfileSetupModal
          onProfileCreated={(newProfile) => {
            setProfile(newProfile);
            refreshUserData(newProfile.id);
          }}
        />
      )}

      {/* Fullscreen Real-Time Audio Calling Overlay */}
      {activeCallSession && profile && (
        <AudioCallModal session={activeCallSession} localUserId={profile.id} />
      )}

      {/* Offline P2P Pairing Modal */}
      {showPairingModal && profile && (
        <OfflinePairingModal
          localUserId={profile.id}
          localUserName={profile.displayName}
          onClose={() => setShowPairingModal(false)}
          onConnectedPeer={async (peerId, peerName) => {
            const db = await getDatabase();
            let contact = await db.get('contacts', peerId);
            if (!contact) {
              contact = {
                id: peerId,
                phoneNumber: '+8801700000000',
                displayName: peerName,
                username: 'peer_direct',
                isBlocked: false,
                lastSeen: Date.now(),
                isOnlineDirect: true,
              };
              await db.put('contacts', contact);
              setContacts((prev) => [...prev, contact!]);
            }
            setShowPairingModal(false);
            handleStartChatWithContact(contact);
          }}
        />
      )}

      {/* New Contact Modal */}
      {showContactModal && (
        <ContactModal
          onClose={() => setShowContactModal(false)}
          onContactSaved={(contact) => {
            setContacts((prev) => [contact, ...prev]);
            handleStartChatWithContact(contact);
          }}
        />
      )}

      {/* Top Navbar */}
      <header className="top-navbar">
        <div className="brand-section">
          <div className="brand-logo-badge">
            <Radio size={22} />
          </div>
          <div>
            <div className="brand-title">
              {t('appTitle')}
              <span className="brand-subtag">BD MESH</span>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>
              {t('appSubtitle')}
            </div>
          </div>
        </div>

        {/* Live Transport Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className={`transport-status-pill ${
              transportStatus.isDirectLanActive
                ? 'direct'
                : transportStatus.isOnlineInternet
                ? 'cloud'
                : 'offline'
            }`}
          >
            <span className="pulse-dot" />
            <span>
              {transportStatus.isDirectLanActive
                ? `${t('transport_direct')} (${transportStatus.connectedPeersCount} peers)`
                : transportStatus.isOnlineInternet
                ? t('network_online')
                : t('network_offline')}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShowPairingModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Zap size={14} />
            {t('offlinePairing')}
          </button>

          {isSyncing && (
            <span style={{ fontSize: '11px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw className="animate-spin" size={12} />
              {t('syncing_now')}
            </span>
          )}

          {pendingOutboxCount > 0 && !isSyncing && (
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
              }}
              title="Messages waiting in local offline outbox"
            >
              ⏳ {pendingOutboxCount} queued
            </span>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="workspace-layout">
        {/* Sidebar Panel */}
        <aside className={`sidebar-panel ${!activeConversationId ? 'show-mobile' : ''}`}>
          <div className="sidebar-tabs">
            <button
              type="button"
              className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
              onClick={() => setActiveTab('chats')}
            >
              <MessageSquare size={16} />
              {t('chats')}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contacts')}
            >
              <Users size={16} />
              {t('contacts')}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'callLogs' ? 'active' : ''}`}
              onClick={() => setActiveTab('callLogs')}
            >
              <Phone size={16} />
              {t('callLogs')}
            </button>
            <button
              type="button"
              className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
            >
              <Settings size={16} />
              {t('settings')}
            </button>
          </div>

          {/* Sidebar Content Areas */}
          <div className="sidebar-content">
            {activeTab === 'chats' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>Conversations</span>
                  <button
                    type="button"
                    onClick={() => setShowContactModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: '12px',
                      color: '#10b981',
                      fontWeight: 600,
                    }}
                  >
                    <Plus size={14} /> New Chat
                  </button>
                </div>

                {conversations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '13px' }}>
                    No conversations yet. Tap "New Chat" or select a contact.
                  </div>
                ) : (
                  conversations.map((conv) => {
                    const peerId = conv.participantIds.find((id) => id !== profile?.id);
                    const peer = contacts.find((c) => c.id === peerId);
                    const isDirect = peerId ? TransportManager.isPeerDirectlyConnected(peerId) : false;

                    return (
                      <div
                        key={conv.id}
                        className={`contact-item-card ${activeConversationId === conv.id ? 'selected' : ''}`}
                        onClick={() => {
                          setActiveConversationId(conv.id);
                          loadMessagesForConversation(conv.id);
                        }}
                      >
                        <div className={`avatar-circle ${isDirect ? 'direct-online' : ''}`}>
                          {(peer?.displayName || conv.name || 'P').charAt(0).toUpperCase()}
                        </div>
                        <div className="item-info">
                          <div className="item-title-row">
                            <span className="item-name">{peer?.displayName || conv.name || 'Chat'}</span>
                            <span className="item-time">
                              {new Date(conv.lastMessageTimestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="item-snippet">{conv.lastMessageSnippet}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeTab === 'contacts' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      placeholder={t('searchContacts')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ width: '100%', paddingLeft: '32px' }}
                    />
                    <Search size={14} color="#64748b" style={{ position: 'absolute', left: 10, top: 12 }} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowContactModal(true)}
                    style={{
                      padding: '0 12px',
                      backgroundColor: 'var(--emerald-primary)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'white',
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '13px' }}>
                    {t('noContactsFound')}
                  </div>
                ) : (
                  contacts
                    .filter((c) => c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || c.phoneNumber.includes(searchQuery))
                    .map((contact) => (
                      <div
                        key={contact.id}
                        className="contact-item-card"
                        onClick={() => handleStartChatWithContact(contact)}
                      >
                        <div className="avatar-circle">
                          {contact.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="item-info">
                          <div className="item-name">{contact.displayName}</div>
                          <div className="item-snippet">{contact.phoneNumber}</div>
                        </div>
                      </div>
                    ))
                )}
              </div>
            )}

            {activeTab === 'callLogs' && (
              <div>
                <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: 12 }}>
                  Recent Audio Calls
                </h3>
                {callLogs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: '13px' }}>
                    No call history yet. Direct offline audio calls will appear here.
                  </div>
                ) : (
                  callLogs.map((log) => (
                    <div key={log.id} className="contact-item-card">
                      <div className="avatar-circle" style={{ background: '#1e293b' }}>
                        <Phone size={18} color={log.status === 'completed' ? '#10b981' : '#f43f5e'} />
                      </div>
                      <div className="item-info">
                        <div className="item-title-row">
                          <span className="item-name">{log.peerName}</span>
                          <span className="item-time">
                            {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: 2 }}>
                          {log.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} • {log.status} •{' '}
                          {log.durationSeconds > 0 ? `${log.durationSeconds}s` : '0s'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'settings' && profile && (
              <SettingsPanel
                profile={profile}
                onProfileReset={() => {
                  IdentityService.logout();
                  setProfile(null);
                }}
                onLanguageChange={(lang) => setCurrentLang(lang)}
              />
            )}
          </div>
        </aside>

        {/* Chat Main View */}
        <main className={`chat-main-view ${!activeConversationId ? 'hide-mobile' : ''}`}>
          {activeConversationId ? (
            <>
              {/* Chat View Header */}
              <div className="chat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    type="button"
                    onClick={() => setActiveConversationId(null)}
                    style={{ padding: '6px', color: '#94a3b8' }}
                  >
                    <ArrowLeft size={20} />
                  </button>

                  <div className={`avatar-circle ${isPeerOnlineDirect ? 'direct-online' : ''}`}>
                    {currentPeerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600 }}>{currentPeerName}</div>
                    <div style={{ fontSize: '11px', color: isPeerOnlineDirect ? '#34d399' : '#94a3b8' }}>
                      {isPeerOnlineDirect ? '🟢 Direct LAN Connected (Offline Ready)' : 'Standard Routing'}
                    </div>
                  </div>
                </div>

                <div className="chat-header-actions">
                  <button
                    type="button"
                    className="action-icon-btn call-action"
                    onClick={handleStartAudioCall}
                    title={t('directOfflineCall')}
                  >
                    <Phone size={18} />
                  </button>
                </div>
              </div>

              {/* Messages Scroll Area */}
              <div className="messages-scroll-area">
                {messages.length === 0 ? (
                  <div style={{ textAlign: 'center', margin: 'auto', color: '#64748b', fontSize: '13px' }}>
                    <Shield size={28} color="#10b981" style={{ margin: '0 auto 10px' }} />
                    End-to-End Encrypted. Messages stay in your local IndexedDB and route directly.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isOutgoing = msg.senderId === profile?.id;

                    return (
                      <div
                        key={msg.id}
                        className={`message-bubble-row ${isOutgoing ? 'outgoing' : 'incoming'}`}
                      >
                        <div className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <FileText size={20} />
                              <div>
                                <div style={{ fontWeight: 600 }}>{msg.media?.fileName || 'File'}</div>
                                <div style={{ fontSize: '11px', opacity: 0.8 }}>
                                  {msg.media?.fileSize ? `${Math.round(msg.media.fileSize / 1024)} KB` : ''}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className={`bubble-meta-row ${isOutgoing ? 'outgoing' : ''}`}>
                          <span>
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>

                          <span className={`transport-badge ${msg.transport}`}>
                            {msg.transport === 'direct_webrtc_lan' && <Zap size={10} />}
                            {msg.transport === 'internet_supabase' && <Wifi size={10} />}
                            {msg.transport === 'offline_queued' && <Clock size={10} />}
                            {msg.transport === 'direct_webrtc_lan'
                              ? 'LAN 0kb'
                              : msg.transport === 'internet_supabase'
                              ? 'Cloud'
                              : 'Queued'}
                          </span>

                          {isOutgoing && (
                            <span>
                              {msg.status === 'delivered' ? (
                                <CheckCheck size={14} color="#34d399" />
                              ) : msg.status === 'synced' ? (
                                <CheckCheck size={14} color="#38bdf8" />
                              ) : (
                                <Check size={14} color="#94a3b8" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* File Transfer Progress Indicator */}
              {fileTransferProgress && (
                <div
                  style={{
                    padding: '8px 20px',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderTop: '1px solid rgba(6, 182, 212, 0.2)',
                    fontSize: '12px',
                    color: '#38bdf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>Transferring {fileTransferProgress.name}...</span>
                  <span>{fileTransferProgress.percent}%</span>
                </div>
              )}

              {/* Chat Input Bar */}
              <form className="chat-input-bar" onSubmit={handleSendMessage}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileSelected}
                />

                <button
                  type="button"
                  className="action-icon-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title={t('attachFile')}
                >
                  <Paperclip size={18} />
                </button>

                <input
                  type="text"
                  className="chat-text-input"
                  placeholder={
                    isRecordingVoice
                      ? `${t('recordingVoice')} (${recordingSeconds}s)`
                      : t('typeMessage')
                  }
                  value={inputText}
                  disabled={isRecordingVoice}
                  onChange={(e) => setInputText(e.target.value)}
                />

                <button
                  type="button"
                  className={`record-voice-btn ${isRecordingVoice ? 'recording' : ''}`}
                  onClick={handleToggleVoiceRecord}
                  title={isRecordingVoice ? t('releaseToSend') : t('holdToRecord')}
                >
                  <Mic size={20} />
                </button>

                <button
                  type="submit"
                  className="send-msg-btn"
                  disabled={!inputText.trim()}
                  title="Send message"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                padding: '40px',
                textAlign: 'center',
                color: '#64748b',
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Radio size={36} color="#10b981" />
              </div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                {t('appTitle')}
              </h2>
              <p style={{ maxWidth: '420px', fontSize: '13px', lineHeight: 1.6, color: '#94a3b8' }}>
                {t('tagline')} Select a conversation from the sidebar or click "Offline Connect" to link with a nearby device.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
