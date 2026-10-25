import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export type MessageType = 'text' | 'voice' | 'file' | 'call_event';
export type MessageStatus = 'queued' | 'sending' | 'delivered' | 'read' | 'synced';
export type TransportType = 'internet_supabase' | 'direct_webrtc_lan' | 'manual_p2p' | 'offline_queued';

export interface UserProfile {
  id: string; // UUID
  phoneNumber: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicKey?: string;
  deviceId: string;
  createdAt: number;
  updatedAt: number;
}

export interface Contact {
  id: string; // UUID
  phoneNumber: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  publicKey?: string;
  deviceId?: string;
  isBlocked: boolean;
  notes?: string;
  lastSeen?: number;
  isOnlineDirect?: boolean; // connected over direct WebRTC LAN
  isOnlineInternet?: boolean; // online via Supabase
}

export interface Conversation {
  id: string; // UUID
  type: 'direct' | 'group';
  name?: string;
  participantIds: string[];
  lastMessageSnippet?: string;
  lastMessageTimestamp: number;
  unreadCount: number;
  draftText?: string;
  updatedAt: number;
}

export interface MessageMedia {
  blobKey?: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  waveform?: number[];
}

export interface Message {
  id: string; // UUIDv4
  conversationId: string;
  senderId: string;
  senderDeviceId: string;
  recipientId?: string; // empty if group
  groupId?: string;
  type: MessageType;
  content: string;
  media?: MessageMedia;
  timestamp: number;
  status: MessageStatus;
  transport: TransportType;
  ackTimestamp?: number;
  signature?: string;
  isDeliveredDirectOffline?: boolean;
}

export interface OutboxItem {
  id: string; // matches message id
  message: Message;
  retryCount: number;
  nextRetryTimestamp: number;
  priority: number;
  targetPeerId?: string;
}

export interface StoredMediaBlob {
  id: string; // unique blob key
  blob: Blob;
  mimeType: string;
  fileName?: string;
  fileSize: number;
  createdAt: number;
}

export interface CallLog {
  id: string;
  peerId: string;
  peerName: string;
  peerPhone?: string;
  direction: 'incoming' | 'outgoing';
  status: 'completed' | 'missed' | 'rejected' | 'busy';
  durationSeconds: number;
  transport: TransportType;
  timestamp: number;
}

export interface SyncCheckpoint {
  key: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface ContactAppDB extends DBSchema {
  profiles: {
    key: string;
    value: UserProfile;
  };
  contacts: {
    key: string;
    value: Contact;
    indexes: {
      'by-phone': string;
      'by-username': string;
    };
  };
  conversations: {
    key: string;
    value: Conversation;
    indexes: {
      'by-updated': number;
    };
  };
  messages: {
    key: string;
    value: Message;
    indexes: {
      'by-conversation': string;
      'by-conversation-time': [string, number];
      'by-status': string;
      'by-timestamp': number;
    };
  };
  outbox: {
    key: string;
    value: OutboxItem;
    indexes: {
      'by-priority': number;
      'by-retry': number;
    };
  };
  mediaBlobs: {
    key: string;
    value: StoredMediaBlob;
    indexes: {
      'by-created': number;
    };
  };
  callLogs: {
    key: string;
    value: CallLog;
    indexes: {
      'by-timestamp': number;
      'by-peer': string;
    };
  };
  syncCheckpoints: {
    key: string;
    value: SyncCheckpoint;
  };
}

const DB_NAME = 'contact_network_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ContactAppDB>> | null = null;

export function getDatabase(): Promise<IDBPDatabase<ContactAppDB>> {
  if (!dbPromise) {
    dbPromise = openDB<ContactAppDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Profiles store
        if (!db.objectStoreNames.contains('profiles')) {
          db.createObjectStore('profiles', { keyPath: 'id' });
        }

        // Contacts store
        if (!db.objectStoreNames.contains('contacts')) {
          const contactStore = db.createObjectStore('contacts', { keyPath: 'id' });
          contactStore.createIndex('by-phone', 'phoneNumber', { unique: false });
          contactStore.createIndex('by-username', 'username', { unique: false });
        }

        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('by-updated', 'updatedAt');
        }

        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('by-conversation', 'conversationId');
          msgStore.createIndex('by-conversation-time', ['conversationId', 'timestamp']);
          msgStore.createIndex('by-status', 'status');
          msgStore.createIndex('by-timestamp', 'timestamp');
        }

        // Outbox queue store
        if (!db.objectStoreNames.contains('outbox')) {
          const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
          outboxStore.createIndex('by-priority', 'priority');
          outboxStore.createIndex('by-retry', 'nextRetryTimestamp');
        }

        // Media blobs store
        if (!db.objectStoreNames.contains('mediaBlobs')) {
          const blobStore = db.createObjectStore('mediaBlobs', { keyPath: 'id' });
          blobStore.createIndex('by-created', 'createdAt');
        }

        // Call logs store
        if (!db.objectStoreNames.contains('callLogs')) {
          const callStore = db.createObjectStore('callLogs', { keyPath: 'id' });
          callStore.createIndex('by-timestamp', 'timestamp');
          callStore.createIndex('by-peer', 'peerId');
        }

        // Sync checkpoints
        if (!db.objectStoreNames.contains('syncCheckpoints')) {
          db.createObjectStore('syncCheckpoints', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// Media blob storage helpers
export async function saveMediaBlob(blobKey: string, blob: Blob, fileName?: string): Promise<string> {
  const db = await getDatabase();
  const entry: StoredMediaBlob = {
    id: blobKey,
    blob,
    mimeType: blob.type,
    fileName,
    fileSize: blob.size,
    createdAt: Date.now(),
  };
  await db.put('mediaBlobs', entry);
  return blobKey;
}

export async function getMediaBlob(blobKey: string): Promise<Blob | null> {
  const db = await getDatabase();
  const entry = await db.get('mediaBlobs', blobKey);
  return entry ? entry.blob : null;
}

// Storage Quota awareness
export async function getStorageQuotaInfo(): Promise<{ usedBytes: number; quotaBytes: number; percentage: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const quota = estimate.quota || 1;
    return {
      usedBytes: used,
      quotaBytes: quota,
      percentage: Math.round((used / quota) * 100),
    };
  }
  return { usedBytes: 0, quotaBytes: 0, percentage: 0 };
}
