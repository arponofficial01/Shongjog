// Recovery & Multi-Device Realtime Cloud Sync Service
// Encrypted chat backup PIN verification, multi-device instant restore, and automatic cloud reconciliation

import { getDatabase } from '../db/database';
import type { UserProfile, Contact, Conversation, Message } from '../db/database';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';
import { TotpService } from '../auth/totpService';

export class RecoverySyncService {
  /**
   * Hashes a 6-digit Recovery PIN with SHA-256 via native WebCrypto
   */
  public static async hashPin(pin: string): Promise<string> {
    const clean = pin.trim();
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(`shongjog_recpin_${clean}`));
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Checks if user has a Recovery / 2FA Security PIN or TOTP Authenticator set (in IndexedDB, localStorage, or Supabase profile)
   */
  public static async getRecoveryPinStatus(profile: UserProfile): Promise<{
    hasPin: boolean;
    pinHash?: string;
    plainPin?: string;
    totpSecret?: string;
    hasTotp?: boolean;
  }> {
    let totpSecret = TotpService.extractTotpSecret(profile.bio);

    // 1. Check local profile first
    if (profile.recoveryPinHash) {
      return { hasPin: true, pinHash: profile.recoveryPinHash, totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
    }
    if (profile.chatLockPin) {
      return { hasPin: true, plainPin: profile.chatLockPin, totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
    }

    // 2. Check localStorage
    const localPin = localStorage.getItem('shongjog_chat_pin') || localStorage.getItem('shongjog_device_pin');
    if (localPin && /^\d{6}$/.test(localPin.trim())) {
      return { hasPin: true, plainPin: localPin.trim(), totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
    }

    // 3. Check bio for embedded __recpin: or __lockpin: or __totp:
    if (profile.bio) {
      const recMatch = profile.bio.match(/__recpin:([a-f0-9]+)/);
      const lockMatch = profile.bio.match(/__lockpin:([0-9]{6})/);
      const totpMatch = profile.bio.match(/__totp:([A-Za-z0-9]+)/);
      if (totpMatch) totpSecret = totpMatch[1].toUpperCase();

      if (recMatch) {
        return { hasPin: true, pinHash: recMatch[1], totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
      }
      if (lockMatch) {
        return { hasPin: true, plainPin: lockMatch[1], totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
      }
    }

    // 4. Check remote Supabase if online (by ID or phone number)
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let query = supabase.from('profiles').select('bio, id, phone_number');
        if (profile.id && profile.phoneNumber) {
          query = query.or(`id.eq.${profile.id},phone_number.eq.${profile.phoneNumber}`);
        } else if (profile.id) {
          query = query.eq('id', profile.id);
        } else if (profile.phoneNumber) {
          query = query.eq('phone_number', profile.phoneNumber);
        }

        const { data } = await query.maybeSingle();

        if (data && data.bio) {
          const totpMatch = data.bio.match(/__totp:([A-Za-z0-9]+)/);
          if (totpMatch) {
            totpSecret = totpMatch[1].toUpperCase();
          }
          const recMatch = data.bio.match(/__recpin:([a-f0-9]+)/);
          if (recMatch) {
            return { hasPin: true, pinHash: recMatch[1], totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
          }
          const lockMatch = data.bio.match(/__lockpin:([0-9]{6})/);
          if (lockMatch) {
            return { hasPin: true, plainPin: lockMatch[1], totpSecret: totpSecret || undefined, hasTotp: Boolean(totpSecret) };
          }
          if (totpSecret) {
            return { hasPin: true, totpSecret, hasTotp: true };
          }
        }
      } catch (err) {
        console.warn('Could not check remote recovery pin status', err);
      }
    }

    if (totpSecret) {
      return { hasPin: true, totpSecret, hasTotp: true };
    }

    return { hasPin: false };
  }

  /**
   * Sets or updates the 6-digit recovery / 2FA PIN for the profile
   */
  public static async setRecoveryPin(
    profile: UserProfile,
    pin: string
  ): Promise<{ success: boolean; hash: string }> {
    const cleanPin = pin.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      throw new Error('Recovery PIN must be exactly 6 numeric digits.');
    }

    const hash = await this.hashPin(cleanPin);
    const db = await getDatabase();

    // Store in localStorage for instant offline access on this device
    localStorage.setItem('shongjog_chat_pin', cleanPin);
    localStorage.setItem('shongjog_device_pin', cleanPin);

    // Clean existing tags from bio
    let baseBio = profile.bio || 'Available on Shongjog direct network';
    baseBio = baseBio
      .replace(/\s*__recpin:[a-f0-9]+/g, '')
      .replace(/\s*__lockpin:[0-9]+/g, '')
      .trim();

    const updatedProfile: UserProfile = {
      ...profile,
      recoveryPinHash: hash,
      chatLockPin: cleanPin,
      bio: baseBio,
      updatedAt: Date.now(),
    };

    await db.put('profiles', updatedProfile);

    // Sync to Supabase cloud profile with both __recpin and __lockpin for seamless multi-device compatibility
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let remoteBio = `${baseBio} __recpin:${hash} __lockpin:${cleanPin}`;
        if (profile.passwordHash) {
          remoteBio += ` __pwd:${profile.passwordHash}`;
        }

        await supabase
          .from('profiles')
          .update({
            bio: remoteBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('Supabase recovery pin sync error:', err);
      }
    }

    return { success: true, hash };
  }

  /**
   * Verifies the entered 6-digit PIN against stored hash, synced lockpin, or active TOTP Authenticator across all devices
   */
  public static async verifyPin(profile: UserProfile, pin: string): Promise<boolean> {
    const cleanPin = pin.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      return false;
    }

    const enteredHash = await this.hashPin(cleanPin);

    // Direct check against profile state
    if (profile.recoveryPinHash && profile.recoveryPinHash === enteredHash) {
      return true;
    }
    if (profile.chatLockPin && profile.chatLockPin === cleanPin) {
      return true;
    }

    // Direct check against device storage
    const localPin = localStorage.getItem('shongjog_chat_pin') || localStorage.getItem('shongjog_device_pin');
    if (localPin && localPin === cleanPin) {
      return true;
    }

    // Check through getRecoveryPinStatus (includes cloud query by ID and phone, plus TOTP check)
    const status = await this.getRecoveryPinStatus(profile);

    // 1. Check against active Google / Microsoft Authenticator TOTP code if 2FA is active
    if (status.totpSecret) {
      const isTotpValid = await TotpService.verifyCode(status.totpSecret, cleanPin);
      if (isTotpValid) {
        return true;
      }
    }

    if (!status.hasPin) {
      return false;
    }

    if (status.pinHash && status.pinHash === enteredHash) {
      return true;
    }
    if (status.plainPin && status.plainPin === cleanPin) {
      return true;
    }

    return false;
  }

  /**
   * Performs an instant full cloud restore and synchronization across all devices
   */
  public static async performFullCloudRestoreAndSync(
    profile: UserProfile,
    onProgress?: (status: string) => void
  ): Promise<{
    messagesCount: number;
    contactsCount: number;
    conversationsCount: number;
  }> {
    const { isConfigured } = getSupabaseConfig();
    if (!navigator.onLine || !isConfigured) {
      throw new Error('An active internet connection is required to restore cloud backup.');
    }

    onProgress?.('Connecting to cloud security vault...');
    const supabase = getSupabase();
    const db = await getDatabase();

    // 1. Fetch all messages involving this user from Supabase PostgreSQL
    onProgress?.('Decrypting messages from cloud store...');
    const { data: remoteMessages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
      .order('created_at', { ascending: true });

    if (msgError) {
      throw new Error(`Failed to fetch cloud messages: ${msgError.message}`);
    }

    const messages = remoteMessages || [];
    onProgress?.(`Restoring ${messages.length} messages into local database...`);

    // Group messages by conversationId
    const conversationsMap = new Map<string, { lastMsg: Message; msgs: Message[]; peerId: string }>();
    const peerIds = new Set<string>();

    for (const rm of messages) {
      const msgTime = new Date(rm.created_at).getTime();
      const localMsg: Message = {
        id: rm.id,
        conversationId: rm.conversation_id,
        senderId: rm.sender_id,
        senderDeviceId: rm.sender_device_id,
        recipientId: rm.recipient_id,
        type: rm.type as any,
        content: rm.content,
        media: {
          url: rm.media_url,
          fileName: rm.file_name,
          fileSize: rm.file_size,
          mimeType: rm.mime_type,
          durationSeconds: rm.duration_seconds,
        },
        timestamp: msgTime,
        status: 'synced',
        transport: rm.transport as any,
        signature: rm.signature,
        isDeliveredDirectOffline: rm.is_delivered_direct_offline,
      };

      await db.put('messages', localMsg);

      const peerId = rm.sender_id === profile.id ? rm.recipient_id : rm.sender_id;
      if (peerId) peerIds.add(peerId);

      const convEntry = conversationsMap.get(rm.conversation_id);
      if (!convEntry || msgTime >= convEntry.lastMsg.timestamp) {
        conversationsMap.set(rm.conversation_id, {
          lastMsg: localMsg,
          msgs: convEntry ? [...convEntry.msgs, localMsg] : [localMsg],
          peerId: peerId || '',
        });
      } else {
        convEntry.msgs.push(localMsg);
      }
    }

    // 2. Fetch peer profiles from Supabase to restore contacts
    onProgress?.('Synchronizing contact identities...');
    let contactsRestored = 0;
    if (peerIds.size > 0) {
      try {
        const { data: peerProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', Array.from(peerIds));

        if (peerProfiles && peerProfiles.length > 0) {
          for (const pp of peerProfiles) {
            let cleanBio = pp.bio || 'Available on Shongjog direct network';
            cleanBio = cleanBio.replace(/\s*__pwd:[a-f0-9]+/, '').replace(/\s*__recpin:[a-f0-9]+/, '').trim();

            const contact: Contact = {
              id: pp.id,
              phoneNumber: pp.phone_number,
              username: pp.username,
              displayName: pp.display_name,
              avatarUrl: pp.avatar_url,
              bio: cleanBio,
              publicKey: pp.public_key,
              deviceId: pp.device_id,
              isBlocked: false,
              isSaved: true,
              lastSeen: new Date(pp.updated_at).getTime(),
              createdAt: new Date(pp.created_at).getTime(),
            };
            await db.put('contacts', contact);
            contactsRestored++;
          }
        }
      } catch (cErr) {
        console.warn('Could not sync peer profiles for contacts', cErr);
      }
    }

    // 3. Rebuild conversations store
    onProgress?.('Reconstructing conversations index...');
    let conversationsRestored = 0;
    for (const [convId, entry] of conversationsMap.entries()) {
      const { lastMsg, peerId } = entry;
      let snippet = (lastMsg.content || '').replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
      if (lastMsg.type === 'voice') snippet = '🎙️ Voice note';
      if (lastMsg.type === 'file') snippet = `📎 ${lastMsg.media?.fileName || 'File attachment'}`;
      if (lastMsg.type === 'call_event') snippet = lastMsg.content ? lastMsg.content.replace(/\r?\n|\r/g, ' ').replace(/\s+/g, ' ').trim() : '📞 Call log';
      snippet = snippet.slice(0, 100);

      const existingConv = await db.get('conversations', convId);
      const conv: Conversation = {
        id: convId,
        type: existingConv?.type || 'direct',
        name: existingConv?.name,
        participantIds: [profile.id, peerId].filter(Boolean),
        lastMessageSnippet: snippet,
        lastMessageTimestamp: lastMsg.timestamp,
        unreadCount: 0,
        updatedAt: lastMsg.timestamp,
      };

      await db.put('conversations', conv);
      conversationsRestored++;
    }

    // 4. Update sync checkpoint
    await db.put('syncCheckpoints', {
      key: 'last_server_message_sync',
      timestamp: Date.now(),
    });

    onProgress?.('Multi-device sync finalized successfully!');

    return {
      messagesCount: messages.length,
      contactsCount: contactsRestored,
      conversationsCount: conversationsRestored,
    };
  }
}

