// Live Supabase Realtime Network Service
// Provides instant (<30ms) cross-device message delivery, WebRTC signaling, and real-time user presence
// Connected via Supabase Realtime WebSocket

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';
import { getDatabase } from '../db/database';
import type { Message, Conversation } from '../db/database';
import { WebRTCService } from './webrtcService';
import type { SignalingMessage } from './webrtcService';
import { CallManager } from '../call/callManager';

export class SupabaseRealtimeService {
  private static instance: SupabaseRealtimeService | null = null;
  private meshChannel: RealtimeChannel | null = null;
  private currentUserId: string | null = null;
  public static onlineUserIds: Set<string> = new Set();

  public static onMessageReceived?: (message: Message) => void;
  public static onPresenceUpdate?: (onlineIds: Set<string>) => void;
  public static onReactionReceived?: (msgId: string, reactions: { [emoji: string]: number }, reactionUsers?: Record<string, any>) => void;
  public static onDeleteReceived?: (msgId: string) => void;
  public static onClearHistoryReceived?: (conversationId: string) => void;
  public static onDeleteConversationReceived?: (conversationId: string) => void;
  public static onGroupUpdateReceived?: (
    conversationId: string,
    updates: { avatarUrl?: string; name?: string; description?: string }
  ) => void;
  public static onGroupSyncReceived?: (payload: any) => void;
  public static onProfileUpdateReceived?: (profile: any) => void;
  public static onReadReceiptReceived?: (conversationId: string, readerId: string) => void;
  public static onTypingReceived?: (conversationId: string, senderId: string, isTyping: boolean) => void;

  public static getInstance(): SupabaseRealtimeService {
    if (!this.instance) {
      this.instance = new SupabaseRealtimeService();
    }
    return this.instance;
  }

  /**
   * Initializes real-time listener and presence for the logged-in user
   */
  public async initForUser(userId: string, username: string): Promise<void> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured) return;

    if (this.currentUserId === userId && this.meshChannel) {
      return;
    }

    this.currentUserId = userId;
    const supabase = getSupabase();

    // Clean up any existing channel
    if (this.meshChannel) {
      try {
        await supabase.removeChannel(this.meshChannel);
      } catch {
        // safe remove
      }
      this.meshChannel = null;
    }

    // Unified high-speed communication & presence mesh channel
    const channelName = 'shongjog_mesh_hub';
    this.meshChannel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: userId },
      },
    });

    // 1. Direct Messages & Multi-Device Cross-Sync
    this.meshChannel.on('broadcast', { event: 'chat_message' }, async (event) => {
      const payload = event.payload;
      if (!payload) return;

      const msg: Message = payload.message;
      if (!msg || !msg.id) return;

      const db = await getDatabase();
      const currentProfile = await db.get('profiles', userId);
      const myDeviceId = currentProfile?.deviceId;

      const isTargetedToMe = payload.targetId === userId;
      const isFromMyOtherDevice =
        msg.senderId === userId &&
        msg.senderDeviceId &&
        myDeviceId &&
        msg.senderDeviceId !== myDeviceId;

      if (!isTargetedToMe && !isFromMyOtherDevice) return;

      console.log('[Supabase Realtime] Incoming message from:', msg.senderId, isFromMyOtherDevice ? '(Multi-Device Instant Sync)' : '');
      await this.saveIncomingMessage(msg);
      if (SupabaseRealtimeService.onMessageReceived) {
        SupabaseRealtimeService.onMessageReceived(msg);
      }
    });

    // 2. WebRTC Audio Call & Signaling Engine
    this.meshChannel.on('broadcast', { event: 'webrtc_signal' }, (event) => {
      const signal: SignalingMessage = event.payload;
      if (!signal) return;
      const isDirectToMe = signal.targetId === userId;
      const isGroupForMe = Boolean(signal.payload?.isGroup) && signal.senderId !== userId;
      if (!isDirectToMe && !isGroupForMe) return;

      console.log('[Supabase Realtime] Signaling event received:', signal.type, 'from:', signal.senderName);

      if (signal.type === 'call_request') {
        CallManager.getInstance().handleIncomingCallRequest(signal);
      } else if (signal.type === 'call_response') {
        CallManager.getInstance().handleCallResponse(signal);
      } else if (signal.type === 'call_end') {
        CallManager.getInstance().endCall(false);
      } else {
        // WebRTC SDP offer, answer, or ice candidate
        const rtc = WebRTCService.getInstance(userId, signal.senderId);
        rtc.handleIncomingSignalingMessage(signal);
      }
    });

    // 3. Real-Time Online Presence (Instant update on sync, join, or leave)
    const handlePresenceChange = () => {
      if (!this.meshChannel) return;
      const state = this.meshChannel.presenceState();
      const onlineSet = new Set<string>();

      for (const key of Object.keys(state)) {
        const presences = state[key] as any[];
        presences.forEach((p) => {
          if (p.userId) onlineSet.add(p.userId);
        });
      }

      SupabaseRealtimeService.onlineUserIds = onlineSet;
      if (SupabaseRealtimeService.onPresenceUpdate) {
        SupabaseRealtimeService.onPresenceUpdate(onlineSet);
      }
    };

    this.meshChannel
      .on('presence', { event: 'sync' }, handlePresenceChange)
      .on('presence', { event: 'join' }, handlePresenceChange)
      .on('presence', { event: 'leave' }, handlePresenceChange);

    // Instant presence untrack on tab close/unload
    window.addEventListener('beforeunload', () => {
      try {
        if (this.meshChannel) {
          this.meshChannel.untrack();
        }
      } catch {}
    });

    // 4. Mesh Actions (Reactions, Deletes, History Clearing)
    this.meshChannel.on('broadcast', { event: 'mesh_action' }, async (event) => {
      const data = event.payload;
      if (!data) return;

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
        if (SupabaseRealtimeService.onReactionReceived) {
          SupabaseRealtimeService.onReactionReceived(data.msgId, data.reactions, data.reactionUsers);
        }
      } else if (data.type === 'delete_message') {
        const db = await getDatabase();
        await db.delete('messages', data.msgId);
        if (SupabaseRealtimeService.onDeleteReceived) {
          SupabaseRealtimeService.onDeleteReceived(data.msgId);
        }
      } else if (data.type === 'clear_history') {
        const db = await getDatabase();
        const allMsgs = await db.getAllFromIndex('messages', 'by-conversation', data.conversationId);
        for (const m of allMsgs) {
          await db.delete('messages', m.id);
        }
        if (SupabaseRealtimeService.onClearHistoryReceived) {
          SupabaseRealtimeService.onClearHistoryReceived(data.conversationId);
        }
      } else if (data.type === 'delete_conversation') {
        const db = await getDatabase();
        await db.delete('conversations', data.conversationId);
        const allMsgs = await db.getAllFromIndex('messages', 'by-conversation', data.conversationId);
        for (const m of allMsgs) {
          await db.delete('messages', m.id);
        }
        if (SupabaseRealtimeService.onDeleteConversationReceived) {
          SupabaseRealtimeService.onDeleteConversationReceived(data.conversationId);
        }
      } else if (data.type === 'group_avatar_update' || data.type === 'group_update') {
        const db = await getDatabase();
        const conv = await db.get('conversations', data.conversationId);
        if (conv) {
          if (data.avatarUrl !== undefined) conv.avatarUrl = data.avatarUrl;
          if (data.name !== undefined) conv.name = data.name;
          if (data.description !== undefined) conv.description = data.description;
          conv.updatedAt = Date.now();
          await db.put('conversations', conv);
        }
        if (SupabaseRealtimeService.onGroupUpdateReceived) {
          SupabaseRealtimeService.onGroupUpdateReceived(data.conversationId, {
            avatarUrl: data.avatarUrl,
            name: data.name,
            description: data.description,
          });
        }
      } else if (data.type === 'group_sync') {
        if (SupabaseRealtimeService.onGroupSyncReceived) {
          SupabaseRealtimeService.onGroupSyncReceived(data);
        }
      } else if (data.type === 'profile_update') {
        if (SupabaseRealtimeService.onProfileUpdateReceived && data.profile) {
          SupabaseRealtimeService.onProfileUpdateReceived(data.profile);
        }
      } else if (data.type === 'read_receipt') {
        if (SupabaseRealtimeService.onReadReceiptReceived && data.conversationId && data.readerId) {
          SupabaseRealtimeService.onReadReceiptReceived(data.conversationId, data.readerId);
        }
      } else if (data.type === 'typing_indicator') {
        if (SupabaseRealtimeService.onTypingReceived && data.conversationId && data.senderId) {
          SupabaseRealtimeService.onTypingReceived(data.conversationId, data.senderId, Boolean(data.isTyping));
        }
      }
    });

    // Subscribe and track presence
    this.meshChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Supabase Realtime] Successfully subscribed to ${channelName}`);
        try {
          await this.meshChannel?.track({
            userId,
            username,
            onlineAt: Date.now(),
          });
        } catch (e) {
          console.warn('Presence track error:', e);
        }
      }
    });

    // Wire WebRTC signaling delegate to broadcast through this realtime mesh
    WebRTCService.globalSignalingDelegate = (sig) => {
      this.sendSignalingMessage(sig);
    };
  }

  /**
   * Broadcasts a chat message directly to the recipient over the active Realtime mesh
   */
  public async dispatchDirectMessage(recipientId: string, message: Message): Promise<boolean> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured) return false;

    let broadcastOk = false;
    if (this.meshChannel) {
      try {
        const res = await this.meshChannel.send({
          type: 'broadcast',
          event: 'chat_message',
          payload: {
            targetId: recipientId,
            senderId: message.senderId,
            senderDeviceId: message.senderDeviceId,
            message,
          },
        });
        broadcastOk = res === 'ok';
      } catch (err) {
        console.warn('Realtime mesh broadcast error', err);
      }
    }

    // Persist to PostgreSQL database for persistent cloud mailbox storage
    let persistedOk = false;
    try {
      await this.persistToDatabase(message);
      persistedOk = true;
    } catch (e: any) {
      console.debug('Postgres write status:', e?.message || e);
    }

    // Message is dispatched if delivered over realtime mesh OR persisted to cloud mailbox
    return broadcastOk || persistedOk;
  }

  /**
   * Sends WebRTC signaling payload to recipient over active Realtime mesh
   */
  public async sendSignalingMessage(signal: SignalingMessage): Promise<void> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured || !this.meshChannel) return;

    try {
      await this.meshChannel.send({
        type: 'broadcast',
        event: 'webrtc_signal',
        payload: signal,
      });
    } catch (err) {
      console.warn('Error sending signaling over Supabase Realtime', err);
    }
  }

  /**
   * Broadcasts mesh action (reactions, deletes, clear history) to all peers
   */
  public async broadcastMeshEvent(eventPayload: any): Promise<void> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured || !this.meshChannel) return;

    try {
      await this.meshChannel.send({
        type: 'broadcast',
        event: 'mesh_action',
        payload: eventPayload,
      });
    } catch (err) {
      console.warn('Mesh event broadcast error', err);
    }
  }

  /**
   * Stores incoming message into local IndexedDB
   */
  private async saveIncomingMessage(message: Message): Promise<void> {
    const db = await getDatabase();
    await db.put('messages', message);

    let conv = await db.get('conversations', message.conversationId);
    let snippet = (message.content || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
    if (message.type === 'voice') snippet = '🎙️ Voice note';
    if (message.type === 'file') snippet = `📎 ${message.media?.fileName || 'File'}`;
    if (message.type === 'call_event') snippet = message.content ? message.content.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim() : '📞 Call log';
    snippet = snippet.slice(0, 100);

    if (conv) {
      conv.lastMessageSnippet = snippet;
      conv.lastMessageTimestamp = message.timestamp;
      conv.unreadCount = (conv.unreadCount || 0) + 1;
      conv.updatedAt = Date.now();
      await db.put('conversations', conv);
    } else {
      const newConv: Conversation = {
        id: message.conversationId,
        type: 'direct',
        participantIds: [message.senderId, message.recipientId || ''].filter(Boolean),
        lastMessageSnippet: snippet,
        lastMessageTimestamp: message.timestamp,
        unreadCount: 1,
        updatedAt: Date.now(),
      };
      await db.put('conversations', newConv);
    }
  }

  /**
   * Broadcasts real-time typing indicator for the active conversation
   */
  public async sendTypingIndicator(conversationId: string, isTyping: boolean): Promise<void> {
    if (this.meshChannel) {
      try {
        await this.meshChannel.send({
          type: 'broadcast',
          event: 'mesh_action',
          payload: {
            type: 'typing_indicator',
            conversationId,
            senderId: this.currentUserId,
            isTyping,
          },
        });
      } catch {
        // safe broadcast
      }
    }
  }

  private async persistToDatabase(message: Message): Promise<void> {
    const supabase = getSupabase();
    await supabase.from('messages').upsert({
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
      signature: message.signature || null,
      is_delivered_direct_offline: false,
      created_at: new Date(message.timestamp).toISOString(),
    });
  }
}
