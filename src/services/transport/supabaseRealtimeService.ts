// Live Supabase Realtime Network Service
// Provides instant (<50ms) cross-device message delivery and WebRTC signaling
// Works over Supabase Realtime WebSockets anywhere in the world

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';
import { getDatabase } from '../db/database';
import type { Message, Conversation } from '../db/database';
import { WebRTCService } from './webrtcService';
import type { SignalingMessage } from './webrtcService';
import { CallManager } from '../call/callManager';

export class SupabaseRealtimeService {
  private static instance: SupabaseRealtimeService | null = null;
  private channel: RealtimeChannel | null = null;
  private currentUserId: string | null = null;

  public static onMessageReceived?: (message: Message) => void;
  public static onPresenceUpdate?: (onlineUserIds: string[]) => void;

  public static getInstance(): SupabaseRealtimeService {
    if (!this.instance) {
      this.instance = new SupabaseRealtimeService();
    }
    return this.instance;
  }

  /**
   * Initializes real-time listener for the logged-in user
   */
  public async initForUser(userId: string, username: string): Promise<void> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured) return;

    if (this.currentUserId === userId && this.channel) {
      return;
    }

    this.currentUserId = userId;
    const supabase = getSupabase();

    // Clean up previous channel if any
    if (this.channel) {
      await supabase.removeChannel(this.channel);
      this.channel = null;
    }

    // Subscribe to user-specific inbox channel
    const channelName = `shongjog_inbox_${userId}`;
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: { ack: true, self: false },
        presence: { key: userId },
      },
    });

    // 1. Listen for incoming direct messages
    this.channel.on('broadcast', { event: 'chat_message' }, async (event) => {
      const msg: Message = event.payload;
      if (!msg || !msg.id) return;

      console.log('Realtime message received:', msg);
      await this.saveIncomingMessage(msg);
      if (SupabaseRealtimeService.onMessageReceived) {
        SupabaseRealtimeService.onMessageReceived(msg);
      }
    });

    // 2. Listen for WebRTC Signaling (Offers, Answers, ICE candidates)
    this.channel.on('broadcast', { event: 'webrtc_signal' }, (event) => {
      const signal: SignalingMessage = event.payload;
      if (!signal || signal.targetId !== userId) return;

      console.log('Realtime WebRTC signaling received:', signal.type);
      const rtc = WebRTCService.getInstance(userId, signal.senderId);
      rtc.handleIncomingSignalingMessage(signal);
    });

    // 3. Listen for Incoming Audio Calls
    this.channel.on('broadcast', { event: 'call_request' }, (event) => {
      const callData = event.payload;
      if (!callData || callData.targetId !== userId) return;

      console.log('Realtime call request received from:', callData.senderName);
      CallManager.getInstance().handleIncomingCallRequest(callData);
    });

    // 4. Listen for Call Response (Accept / Reject)
    this.channel.on('broadcast', { event: 'call_response' }, (event) => {
      const callData = event.payload;
      if (!callData || callData.targetId !== userId) return;

      console.log('Realtime call response:', callData.payload?.action);
      CallManager.getInstance().handleCallResponse(callData);
    });

    // 5. Listen for Call End
    this.channel.on('broadcast', { event: 'call_end' }, (event) => {
      const callData = event.payload;
      if (!callData || callData.targetId !== userId) return;

      console.log('Realtime call ended by peer');
      CallManager.getInstance().endCall(false);
    });

    // Subscribe and track presence
    this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`Live Supabase Realtime connected on ${channelName}`);
        await this.channel?.track({
          userId,
          username,
          onlineAt: new Date().toISOString(),
        });
      }
    });

    // Also wire WebRTCService signaling delegate so any WebRTC calls use this Supabase channel
    WebRTCService.globalSignalingDelegate = (sig) => {
      this.sendSignalingMessage(sig);
    };
  }

  /**
   * Broadcasts a chat message directly to recipient's inbox channel
   */
  public async dispatchDirectMessage(recipientId: string, message: Message): Promise<boolean> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured) return false;

    const supabase = getSupabase();
    const recipientChannelName = `shongjog_inbox_${recipientId}`;
    const targetChannel = supabase.channel(recipientChannelName);

    try {
      // Send broadcast event
      const res = await targetChannel.send({
        type: 'broadcast',
        event: 'chat_message',
        payload: message,
      });

      // Also attempt async cloud persistence to PostgreSQL if tables exist
      this.persistToDatabase(message).catch((e) => {
        console.debug('Postgres table write skipped (using Realtime WebSocket):', e.message);
      });

      return res === 'ok';
    } catch (err) {
      console.warn('Realtime dispatch error', err);
      return false;
    }
  }

  /**
   * Sends WebRTC signaling payload to recipient
   */
  public async sendSignalingMessage(signal: SignalingMessage): Promise<void> {
    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured) return;

    const supabase = getSupabase();
    const recipientChannelName = `shongjog_inbox_${signal.targetId}`;
    const targetChannel = supabase.channel(recipientChannelName);

    let eventName = 'webrtc_signal';
    if (signal.type === 'call_request') eventName = 'call_request';
    if (signal.type === 'call_response') eventName = 'call_response';
    if (signal.type === 'call_end') eventName = 'call_end';

    try {
      await targetChannel.send({
        type: 'broadcast',
        event: eventName,
        payload: signal,
      });
    } catch (err) {
      console.warn('Error sending signaling over Supabase Realtime', err);
    }
  }

  /**
   * Stores incoming message into local IndexedDB
   */
  private async saveIncomingMessage(message: Message): Promise<void> {
    const db = await getDatabase();
    await db.put('messages', message);

    let conv = await db.get('conversations', message.conversationId);
    let snippet = message.content;
    if (message.type === 'voice') snippet = '🎙️ Voice note';
    if (message.type === 'file') snippet = `📎 ${message.media?.fileName || 'File'}`;

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
   * Attempts Postgres table insertion
   */
  private async persistToDatabase(message: Message): Promise<void> {
    const supabase = getSupabase();
    await supabase.from('messages').insert({
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
