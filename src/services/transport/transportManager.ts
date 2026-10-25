// Transport Manager
// Evaluates platform capabilities, routes outgoing messages through the optimal available transport,
// and enforces idempotent delivery and status reporting across WebRTC, Supabase Realtime, and Outbox

import { getDatabase } from '../db/database';
import type { Message, TransportType, Conversation } from '../db/database';
import { WebRTCService } from './webrtcService';
import { SyncEngine } from '../sync/syncEngine';
import { CryptoService } from '../crypto/cryptoService';
import { getSupabaseConfig } from '../supabase/supabaseClient';
import { SupabaseRealtimeService } from './supabaseRealtimeService';

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
  public static onReactionUpdate?: (msgId: string, reactions: { [emoji: string]: number }) => void;
  public static onDeleteMessage?: (msgId: string) => void;
  public static onClearHistory?: (conversationId: string) => void;
  public static onDeleteConversation?: (conversationId: string) => void;

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

        // Check if event is a reaction update
        if (data.type === 'reaction_update') {
          console.log('BroadcastChannel reaction update:', data);
          const db = await getDatabase();
          const m = await db.get('messages', data.msgId);
          if (m) {
            m.reactions = data.reactions;
            await db.put('messages', m);
          }
          if (this.onReactionUpdate) {
            this.onReactionUpdate(data.msgId, data.reactions);
          }
          return;
        }

        // Check if event is a delete message
        if (data.type === 'delete_message') {
          console.log('BroadcastChannel delete message:', data);
          const db = await getDatabase();
          await db.delete('messages', data.msgId);
          if (this.onDeleteMessage) {
            this.onDeleteMessage(data.msgId);
          }
          return;
        }

        // Check if event is clear history
        if (data.type === 'clear_history') {
          console.log('BroadcastChannel clear history:', data);
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

        // Check if event is delete conversation
        if (data.type === 'delete_conversation') {
          console.log('BroadcastChannel delete conversation:', data);
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

    SupabaseRealtimeService.onReactionReceived = (msgId, reactions) => {
      if (this.onReactionUpdate) {
        this.onReactionUpdate(msgId, reactions);
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
   * Broadcasts an event (reaction, delete, clear history) across all active transports
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
          message.status = 'delivered';
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
    const db = await getDatabase();
    let conv = await db.get('conversations', message.conversationId);
    let snippet = message.content;
    if (message.type === 'voice') snippet = '🎙️ Voice note';
    if (message.type === 'file') snippet = `📎 ${message.media?.fileName || 'File attachment'}`;
    if (message.type === 'call_event') snippet = '📞 Call log';

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
