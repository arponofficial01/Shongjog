// Transport Manager
// Evaluates platform capabilities, routes outgoing messages through the optimal available transport,
// and enforces idempotent delivery and status reporting

import { getDatabase } from '../db/database';
import type { Message, TransportType, Conversation } from '../db/database';
import { WebRTCService } from './webrtcService';
import { SyncEngine } from '../sync/syncEngine';
import { CryptoService } from '../crypto/cryptoService';
import { getSupabaseConfig, getSupabase } from '../supabase/supabaseClient';

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

  public static init() {
    window.addEventListener('online', () => this.notifyStatusChange());
    window.addEventListener('offline', () => this.notifyStatusChange());
    SyncEngine.init();
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

    // Strategy 2: Internet Supabase Sync (When online)
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        const { error } = await supabase.from('messages').insert({
          id: message.id,
          conversation_id: message.conversationId,
          sender_id: message.senderId,
          sender_device_id: message.senderDeviceId,
          recipient_id: message.recipientId || null,
          type: message.type,
          content: message.content,
          media_url: message.media?.url || null,
          file_name: message.media?.fileName || null,
          file_size: message.media?.fileSize || null,
          mime_type: message.media?.mimeType || null,
          duration_seconds: message.media?.durationSeconds || null,
          transport: 'internet_supabase',
          status: 'delivered',
          signature: message.signature,
          is_delivered_direct_offline: false,
          created_at: new Date(message.timestamp).toISOString(),
        });

        if (!error) {
          message.transport = 'internet_supabase';
          message.status = 'delivered';
          await db.put('messages', message);
          await this.updateConversationSnippet(message);
          return { message, transportUsed: 'internet_supabase' };
        }
      } catch (err) {
        console.warn('Cloud dispatch failed, falling back to outbox queue', err);
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
