// Two-Way Synchronization and Durable Outbox Engine
// Ensures idempotent offline message queuing, duplicate prevention, and Supabase reconciliation

import { getDatabase } from '../db/database';
import type { Message, OutboxItem } from '../db/database';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';

export class SyncEngine {
  private static isSyncing: boolean = false;
  private static syncInterval: any = null;

  public static onSyncStatusChange?: (isSyncing: boolean, pendingCount: number) => void;

  /**
   * Initializes background synchronization listeners
   */
  public static init(): void {
    window.addEventListener('online', () => {
      console.log('Network online detected: Triggering outbox synchronization');
      this.triggerSync();
    });

    // Periodic check every 15 seconds
    if (!this.syncInterval) {
      this.syncInterval = setInterval(() => {
        if (navigator.onLine) {
          this.triggerSync();
        }
      }, 15000);
    }
  }

  /**
   * Queues a message in the local outbox store
   */
  public static async enqueueMessage(message: Message, targetPeerId?: string): Promise<void> {
    const db = await getDatabase();
    const outboxItem: OutboxItem = {
      id: message.id,
      message,
      retryCount: 0,
      nextRetryTimestamp: Date.now(),
      priority: message.type === 'call_event' ? 10 : 1,
      targetPeerId,
    };
    await db.put('outbox', outboxItem);
  }

  /**
   * Triggers two-way sync: drains outbox and pulls server updates
   */
  public static async triggerSync(): Promise<{ pushedCount: number; pulledCount: number }> {
    if (this.isSyncing) return { pushedCount: 0, pulledCount: 0 };

    const { isConfigured } = getSupabaseConfig();
    if (!navigator.onLine || !isConfigured) {
      return { pushedCount: 0, pulledCount: 0 };
    }

    this.isSyncing = true;
    this.notifyStatus(true);

    let pushedCount = 0;
    let pulledCount = 0;

    try {
      pushedCount = await this.drainOutboxQueue();
      pulledCount = await this.pullServerDelta();
    } catch (err) {
      console.warn('Sync cycle encountered an error', err);
    } finally {
      this.isSyncing = false;
      this.notifyStatus(false);
    }

    return { pushedCount, pulledCount };
  }

  /**
   * Pushes pending outbox messages to Supabase Postgres
   */
  private static async drainOutboxQueue(): Promise<number> {
    const db = await getDatabase();
    const outboxItems = await db.getAll('outbox');
    if (outboxItems.length === 0) return 0;

    const supabase = getSupabase();
    let synced = 0;

    for (const item of outboxItems) {
      try {
        const msg = item.message;

        // Idempotent upsert by message ID
        const { error } = await supabase.from('messages').upsert({
          id: msg.id,
          conversation_id: msg.conversationId,
          sender_id: msg.senderId,
          sender_device_id: msg.senderDeviceId,
          recipient_id: msg.recipientId || null,
          type: msg.type,
          content: msg.content,
          media_url: msg.media?.url || null,
          file_name: msg.media?.fileName || null,
          file_size: msg.media?.fileSize || null,
          mime_type: msg.media?.mimeType || null,
          duration_seconds: msg.media?.durationSeconds || null,
          transport: msg.transport,
          status: 'synced',
          signature: msg.signature || null,
          is_delivered_direct_offline: msg.isDeliveredDirectOffline || false,
          created_at: new Date(msg.timestamp).toISOString(),
        });

        if (error) {
          throw error;
        }

        // Mark local message as synced
        msg.status = 'synced';
        await db.put('messages', msg);

        // Remove from outbox
        await db.delete('outbox', item.id);
        synced++;
      } catch (err) {
        console.warn(`Failed to push message ${item.id}`, err);
        item.retryCount += 1;
        item.nextRetryTimestamp = Date.now() + Math.min(60000, 2000 * Math.pow(2, item.retryCount));
        await db.put('outbox', item);
      }
    }

    return synced;
  }

  /**
   * Pulls new messages and updates from Supabase since last sync checkpoint
   */
  private static async pullServerDelta(): Promise<number> {
    const db = await getDatabase();
    const checkpoint = await db.get('syncCheckpoints', 'last_server_message_sync');
    const lastTimestamp = checkpoint ? checkpoint.timestamp : 0;

    const supabase = getSupabase();
    const activeProfile = await db.getAll('profiles');
    if (activeProfile.length === 0) return 0;
    const currentUserId = activeProfile[0].id;

    const isoDate = new Date(lastTimestamp).toISOString();

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`recipient_id.eq.${currentUserId},sender_id.eq.${currentUserId}`)
      .gt('created_at', isoDate)
      .order('created_at', { ascending: true })
      .limit(100);

    if (error || !data) return 0;

    let imported = 0;
    let latestTime = lastTimestamp;

    for (const remote of data) {
      const remoteTime = new Date(remote.created_at).getTime();
      if (remoteTime > latestTime) latestTime = remoteTime;

      const existing = await db.get('messages', remote.id);
      if (!existing) {
        const newMsg: Message = {
          id: remote.id,
          conversationId: remote.conversation_id,
          senderId: remote.sender_id,
          senderDeviceId: remote.sender_device_id,
          recipientId: remote.recipient_id,
          type: remote.type as any,
          content: remote.content,
          media: {
            url: remote.media_url,
            fileName: remote.file_name,
            fileSize: remote.file_size,
            mimeType: remote.mime_type,
            durationSeconds: remote.duration_seconds,
          },
          timestamp: remoteTime,
          status: 'synced',
          transport: remote.transport as any,
          signature: remote.signature,
          isDeliveredDirectOffline: remote.is_delivered_direct_offline,
        };

        await db.put('messages', newMsg);
        imported++;
      }
    }

    if (latestTime > lastTimestamp) {
      await db.put('syncCheckpoints', {
        key: 'last_server_message_sync',
        timestamp: latestTime,
      });
    }

    return imported;
  }

  /**
   * Gets number of pending outbox items
   */
  public static async getPendingOutboxCount(): Promise<number> {
    const db = await getDatabase();
    return await db.count('outbox');
  }

  private static async notifyStatus(isSyncing: boolean) {
    if (this.onSyncStatusChange) {
      const count = await this.getPendingOutboxCount();
      this.onSyncStatusChange(isSyncing, count);
    }
  }
}
