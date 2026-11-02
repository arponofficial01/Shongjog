// Transport Manager
// Evaluates platform capabilities, routes outgoing messages through the optimal available transport,
// and enforces idempotent delivery and status reporting across WebRTC, Supabase Realtime, and Outbox

import { getDatabase } from '../db/database';
import type { Message, TransportType, Conversation, Contact } from '../db/database';
import { WebRTCService } from './webrtcService';
import { SyncEngine } from '../sync/syncEngine';
import { CryptoService } from '../crypto/cryptoService';
import { getSupabaseConfig } from '../supabase/supabaseClient';
import { SupabaseRealtimeService } from './supabaseRealtimeService';
import { LanSignalingService } from './lanSignalingService';

export interface TransportStatus {
  isOnlineInternet: boolean;
  isDirectLanActive: boolean;
  connectedPeersCount: number;
  activeTransport: TransportType;
  supabaseConfigured: boolean;
}

export class TransportManager {
  private static activeP2PPeers: Set<string> = new Set();
  private static statusListeners: ((status: TransportStatus) => void)[] = [];
  private static broadcastChannel: BroadcastChannel | null = null;

  public static onIncomingMessage?: (msg: Message) => void;
  public static onReactionUpdate?: (msgId: string, reactions: { [emoji: string]: number }, reactionUsers?: Record<string, any>) => void;
  public static onDeleteMessage?: (msgId: string) => void;
  public static onClearHistory?: (conversationId: string) => void;
  public static onDeleteConversation?: (conversationId: string) => void;
  public static onGroupUpdate?: (
    conversationId: string,
    updates: { avatarUrl?: string; name?: string; description?: string }
  ) => void;
  public static onGroupSync?: (payload: {
    conversation: Conversation;
    addedParticipantIds?: string[];
    invitedByName?: string;
    systemMessage?: Message;
  }) => void;
  public static onProfileUpdate?: (profile: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
  }) => void;
  public static onReadReceipt?: (conversationId: string, readerId: string) => void;

  public static async handleIncomingMeshEvent(data: any): Promise<void> {
    if (!data || !data.type) return;

    // 1. Reaction Updates
    if (data.type === 'reaction_update') {
      const db = await getDatabase();
      const m = await db.get('messages', data.msgId);
      if (m) {
        m.reactions = data.reactions;
        if (data.reactionUsers) {
          m.reactionUsers = data.reactionUsers;
        }
        await db.put('messages', m);
      }
      if (this.onReactionUpdate) {
        this.onReactionUpdate(data.msgId, data.reactions, data.reactionUsers);
      }
      return;
    }

    // 2. Delete Message
    if (data.type === 'delete_message' || data.type === 'delete_message_for_everyone') {
      const db = await getDatabase();
      await db.delete('messages', data.msgId);
      if (this.onDeleteMessage) {
        this.onDeleteMessage(data.msgId);
      }
      return;
    }

    // 3. Clear History
    if (data.type === 'clear_history') {
      const db = await getDatabase();
      const allMsgs = await db.getAllFromIndex('messages', 'by-conversation', data.conversationId);
      for (const m of allMsgs) {
        await db.delete('messages', m.id);
      }
      if (this.onClearHistory) {
        this.onClearHistory(data.conversationId);
      }
      return;
    }

    // 4. Delete Conversation
    if (data.type === 'delete_conversation') {
      const db = await getDatabase();
      await db.delete('conversations', data.conversationId);
      const allMsgs = await db.getAllFromIndex('messages', 'by-conversation', data.conversationId);
      for (const m of allMsgs) {
        await db.delete('messages', m.id);
      }
      if (this.onDeleteConversation) {
        this.onDeleteConversation(data.conversationId);
      }
      return;
    }

    // 5. Group Metadata Update
    if (data.type === 'group_avatar_update' || data.type === 'group_update') {
      const db = await getDatabase();
      const conv = await db.get('conversations', data.conversationId);
      if (conv) {
        if (data.avatarUrl !== undefined) conv.avatarUrl = data.avatarUrl;
        if (data.name !== undefined) conv.name = data.name;
        if (data.description !== undefined) conv.description = data.description;
        conv.updatedAt = Date.now();
        await db.put('conversations', conv);
      }
      if (this.onGroupUpdate) {
        this.onGroupUpdate(data.conversationId, {
          avatarUrl: data.avatarUrl,
          name: data.name,
          description: data.description,
        });
      }
      return;
    }

    // 6. Group Sync
    if (data.type === 'group_sync') {
      if (this.onGroupSync) {
        this.onGroupSync(data);
      }
      return;
    }

    // 7. Read Receipt
    if (data.type === 'read_receipt' && data.conversationId && data.readerId) {
      if (this.onReadReceipt) {
        this.onReadReceipt(data.conversationId, data.readerId);
      }
      return;
    }

    // 8. Live Peer Profile Update (Picture, Display Name, Username, Bio)
    if (data.type === 'profile_update' && data.profile) {
      const p = data.profile;
      if (!p.id) return;
      const db = await getDatabase();
      const existingContact = await db.get('contacts', p.id);

      const updatedContact: Contact = {
        id: p.id,
        displayName: p.displayName || existingContact?.displayName || (p.username ? `@${p.username}` : (p.id ? `Peer ${p.id.slice(0, 6)}` : 'Contact')),
        username: p.username || existingContact?.username || '',
        phoneNumber: p.phoneNumber || existingContact?.phoneNumber || '',
        avatarUrl: p.avatarUrl !== undefined ? p.avatarUrl : existingContact?.avatarUrl,
        notes: p.bio !== undefined ? p.bio : existingContact?.notes,
        publicKey: p.publicKey || existingContact?.publicKey || '',
        isBlocked: existingContact?.isBlocked ?? false,
        isOnlineDirect: existingContact?.isOnlineDirect ?? false,
        isOnlineInternet: existingContact?.isOnlineInternet ?? true,
        lastSeen: Date.now(),
        createdAt: existingContact?.createdAt || Date.now(),
      };
      await db.put('contacts', updatedContact);

      // Also ensure any direct conversations with this peer reflect the updated profile
      const allConvs = await db.getAll('conversations');
      for (const conv of allConvs) {
        if (conv.type === 'direct' && conv.participantIds.includes(p.id)) {
          if (p.displayName) conv.name = p.displayName;
          if (p.avatarUrl !== undefined) conv.avatarUrl = p.avatarUrl;
          await db.put('conversations', conv);
        }
      }

      if (this.onProfileUpdate) {
        this.onProfileUpdate(p);
      }
      return;
    }
  }

  public static init() {
    window.addEventListener('online', () => this.notifyStatusChange());
    window.addEventListener('offline', () => this.notifyStatusChange());
    SyncEngine.init();

    // 1. Setup local BroadcastChannel for offline tabs/devices testing
    try {
      this.broadcastChannel = new BroadcastChannel('offline_mesh_chat');
      this.broadcastChannel.onmessage = async (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type) {
          await this.handleIncomingMeshEvent(data);
          return;
        }

        // Standard chat message
        const msg: Message = data.message || data;
        if (msg && msg.id && msg.conversationId) {
          console.log('Local BroadcastChannel message received:', msg);
          const db = await getDatabase();
          await db.put('messages', msg);
          await this.updateConversationSnippet(msg);
          if (this.onIncomingMessage) {
            this.onIncomingMessage(msg);
          }
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not available', e);
    }

    // 2. Setup Supabase Realtime listeners
    SupabaseRealtimeService.onMessageReceived = async (msg) => {
      console.log('Supabase Realtime incoming message:', msg);
      if (this.onIncomingMessage) {
        this.onIncomingMessage(msg);
      }
    };

    SupabaseRealtimeService.onReactionReceived = (msgId, reactions, reactionUsers) => {
      if (this.onReactionUpdate) {
        this.onReactionUpdate(msgId, reactions, reactionUsers);
      }
    };

    SupabaseRealtimeService.onDeleteReceived = (msgId) => {
      if (this.onDeleteMessage) {
        this.onDeleteMessage(msgId);
      }
    };

    SupabaseRealtimeService.onClearHistoryReceived = (conversationId) => {
      if (this.onClearHistory) {
        this.onClearHistory(conversationId);
      }
    };

    SupabaseRealtimeService.onDeleteConversationReceived = (conversationId) => {
      if (this.onDeleteConversation) {
        this.onDeleteConversation(conversationId);
      }
    };

    SupabaseRealtimeService.onGroupUpdateReceived = (conversationId, updates) => {
      if (this.onGroupUpdate) {
        this.onGroupUpdate(conversationId, updates);
      }
    };

    SupabaseRealtimeService.onGroupSyncReceived = (payload) => {
      if (this.onGroupSync) {
        this.onGroupSync(payload);
      }
    };

    SupabaseRealtimeService.onProfileUpdateReceived = async (profile) => {
      await this.handleIncomingMeshEvent({ type: 'profile_update', profile });
    };

    SupabaseRealtimeService.onReadReceiptReceived = (conversationId, readerId) => {
      if (this.onReadReceipt) {
        this.onReadReceipt(conversationId, readerId);
      }
    };

    // 3. Setup WebRTC DataChannel incoming message listener
    WebRTCService.onChatMessageReceived = async (msg) => {
      console.log('WebRTC DataChannel incoming message:', msg);
      const db = await getDatabase();
      await db.put('messages', msg);
      await this.updateConversationSnippet(msg);
      if (this.onIncomingMessage) {
        this.onIncomingMessage(msg);
      }
    };
  }

  /**
   * Broadcasts an event (reaction, delete, clear history, profile update) across all active transports
   */
  public static broadcastEvent(event: any) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(event);
      } catch (err) {
        console.warn('BroadcastChannel post error', err);
      }
    }
    SupabaseRealtimeService.getInstance().broadcastMeshEvent(event);

    // Also forward through local LAN hub for zero-internet Wi-Fi peers
    try {
      LanSignalingService.sendSignal({
        type: 'mesh_action',
        senderId: '',
        senderName: '',
        targetId: 'all',
        payload: event,
        timestamp: Date.now(),
      });
    } catch {}
  }

  public static registerPeerConnected(peerId: string) {
    this.activeP2PPeers.add(peerId);
    this.notifyStatusChange();
  }

  public static registerPeerDisconnected(peerId: string) {
    this.activeP2PPeers.delete(peerId);
    this.notifyStatusChange();
  }

  public static isPeerDirectlyConnected(peerId: string): boolean {
    return this.activeP2PPeers.has(peerId);
  }

  public static getStatus(): TransportStatus {
    const isOnline = navigator.onLine;
    const { isConfigured } = getSupabaseConfig();
    const hasP2P = this.activeP2PPeers.size > 0;

    let activeTransport: TransportType = 'offline_queued';
    if (hasP2P) {
      activeTransport = 'direct_webrtc_lan';
    } else if (isOnline && isConfigured) {
      activeTransport = 'internet_supabase';
    }

    return {
      isOnlineInternet: isOnline,
      isDirectLanActive: hasP2P,
      connectedPeersCount: this.activeP2PPeers.size,
      activeTransport,
      supabaseConfigured: isConfigured,
    };
  }

  public static onStatusChange(callback: (status: TransportStatus) => void) {
    this.statusListeners.push(callback);
    callback(this.getStatus());
  }

  private static notifyStatusChange() {
    const status = this.getStatus();
    this.statusListeners.forEach((cb) => cb(status));
  }

  /**
   * Dispatches a message through the optimal available transport
   */
  public static async dispatchMessage(
    message: Message,
    targetPeerId?: string
  ): Promise<{ message: Message; transportUsed: TransportType }> {
    const db = await getDatabase();

    // Sign message payload with device key for integrity
    const payloadForSigning = `${message.id}:${message.conversationId}:${message.senderId}:${message.timestamp}:${message.content}`;
    try {
      message.signature = await CryptoService.signPayload(payloadForSigning);
    } catch (e) {
      console.warn('Could not sign message payload', e);
    }

    const peerId = targetPeerId || message.recipientId;

    // Always broadcast to local channel (for instant offline multi-tab / same-machine delivery)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch (err) {
        console.warn('BroadcastChannel post error', err);
      }
    }

    // Strategy 1: Direct WebRTC LAN (Zero Internet, Peer Connected)
    if (peerId && this.isPeerDirectlyConnected(peerId)) {
      const rtc = WebRTCService.getInstance(message.senderId, peerId);
      const sent = rtc.sendData({
        protocol: 'chat_message',
        message,
      });

      if (sent) {
        message.transport = 'direct_webrtc_lan';
        message.status = 'delivered';
        message.isDeliveredDirectOffline = true;
        message.ackTimestamp = Date.now();

        await db.put('messages', message);
        await this.updateConversationSnippet(message);

        // Queue for background cloud reconciliation when internet appears
        await SyncEngine.enqueueMessage(message, peerId);

        return { message, transportUsed: 'direct_webrtc_lan' };
      }
    }

    // Strategy 2: Live Supabase Realtime WebSocket (Instant <50ms delivery across any internet connection)
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured && peerId) {
      try {
        const sent = await SupabaseRealtimeService.getInstance().dispatchDirectMessage(peerId, message);
        if (sent) {
          message.transport = 'internet_supabase';
          const isPeerActive = SupabaseRealtimeService.onlineUserIds.has(peerId);
          message.status = isPeerActive ? 'delivered' : 'sent';
          await db.put('messages', message);
          await this.updateConversationSnippet(message);
          return { message, transportUsed: 'internet_supabase' };
        }
      } catch (err) {
        console.warn('Realtime cloud dispatch failed, falling back to outbox queue', err);
      }
    }

    // Strategy 3: Offline Queued (Persist to durable Outbox)
    message.transport = 'offline_queued';
    message.status = 'queued';

    await db.put('messages', message);
    await this.updateConversationSnippet(message);
    await SyncEngine.enqueueMessage(message, peerId);

    return { message, transportUsed: 'offline_queued' };
  }

  private static async updateConversationSnippet(message: Message) {
    if (
      message.conversationId.includes('demo') ||
      message.conversationId.includes('mesh_direct') ||
      message.conversationId === 'direct_mesh' ||
      message.senderId.includes('demo') ||
      (message.recipientId && message.recipientId.includes('demo'))
    ) {
      return;
    }
    const db = await getDatabase();
    let conv = await db.get('conversations', message.conversationId);
    let snippet = (message.content || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
    if (message.type === 'voice') snippet = '🎙️ Voice note';
    if (message.type === 'file') snippet = `📎 ${message.media?.fileName || 'File attachment'}`;
    if (message.type === 'call_event') snippet = message.content ? message.content.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim() : '📞 Call log';
    snippet = snippet.slice(0, 100);

    if (conv) {
      conv.lastMessageSnippet = snippet;
      conv.lastMessageTimestamp = message.timestamp;
      conv.updatedAt = Date.now();
      await db.put('conversations', conv);
    } else {
      const newConv: Conversation = {
        id: message.conversationId,
        type: 'direct',
        participantIds: [message.senderId, message.recipientId || ''].filter(Boolean),
        lastMessageSnippet: snippet,
        lastMessageTimestamp: message.timestamp,
        unreadCount: 0,
        updatedAt: Date.now(),
      };
      await db.put('conversations', newConv);
    }
  }
}
