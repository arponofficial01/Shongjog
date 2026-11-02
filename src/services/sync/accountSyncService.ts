// Sovereign Account Multi-Device Synchronization Service
// Synchronizes Chat Lock PIN, settings, messages, and contacts across all devices (PC, Android APK, Web)

import { getDatabase } from '../db/database';
import type { UserProfile } from '../db/database';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';
import { RecoverySyncService } from './recoverySyncService';
import { IdentityService } from '../identity/identityService';

export interface SyncedSettingsPayload {
  theme?: string;
  wallpaper?: string;
  fontSize?: string;
  bubbleStyle?: string;
  soundFx?: boolean;
  fxVol?: number;
  enterIsSend?: boolean;
  mediaAutoDownload?: boolean;
  notifMessages?: boolean;
  notifSounds?: boolean;
  notifPreviews?: boolean;
  readReceipts?: boolean;
  privacyLastSeen?: string;
  updatedAt?: number;
}

export class AccountSyncService {
  /**
   * Synchronizes Chat Lock PIN to local storage, IndexedDB, and Cloud Profile
   */
  public static async syncChatLockPin(profile: UserProfile, newPin: string): Promise<void> {
    if (!/^\d{6}$/.test(newPin.trim())) {
      throw new Error('PIN must be exactly 6 numeric digits');
    }
    const cleanPin = newPin.trim();

    // 1. Save locally to device
    localStorage.setItem('shongjog_chat_pin', cleanPin);
    localStorage.setItem('shongjog_device_pin', cleanPin);

    // 2. Save to local IndexedDB profile
    const db = await getDatabase();
    profile.chatLockPin = cleanPin;
    profile.updatedAt = Date.now();
    await db.put('profiles', profile);

    // 3. Sync to Supabase cloud profile so all other devices receive this exact PIN
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let remoteBio = profile.bio || 'Available on Shongjog direct network';
        // Replace existing __lockpin: if present
        remoteBio = remoteBio.replace(/\s*__lockpin:[0-9]+/, '').trim();
        remoteBio = `${remoteBio} __lockpin:${cleanPin}`;

        await supabase
          .from('profiles')
          .update({
            bio: remoteBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('[AccountSyncService] Cloud PIN sync error:', err);
      }
    }
  }

  /**
   * Removes Chat Lock PIN and syncs removal to cloud
   */
  public static async removeChatLockPin(profile: UserProfile): Promise<void> {
    localStorage.removeItem('shongjog_chat_pin');
    localStorage.removeItem('shongjog_device_pin');

    const db = await getDatabase();
    profile.chatLockPin = undefined;
    profile.updatedAt = Date.now();
    await db.put('profiles', profile);

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let remoteBio = profile.bio || 'Available on Shongjog direct network';
        remoteBio = remoteBio.replace(/\s*__lockpin:[0-9]+/, '').trim();

        await supabase
          .from('profiles')
          .update({
            bio: remoteBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('[AccountSyncService] Cloud PIN removal error:', err);
      }
    }
  }

  /**
   * Synchronizes TOTP Two-Factor Authenticator secret to local storage and Cloud Profile
   */
  public static async syncTotpSecret(profile: UserProfile, secret: string): Promise<void> {
    const cleanSecret = secret.trim().toUpperCase();
    localStorage.setItem('shongjog_2fa_secret', cleanSecret);
    localStorage.setItem('shongjog_2fa_enabled', 'true');
    localStorage.setItem('shongjog_2fa_verified', 'true');

    const db = await getDatabase();
    let baseBio = profile.bio || 'Available on Shongjog direct network';
    baseBio = baseBio.replace(/\s*__totp:[A-Za-z0-9]+/g, '').trim();
    profile.bio = `${baseBio} __totp:${cleanSecret}`;
    profile.updatedAt = Date.now();
    await db.put('profiles', profile);

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let remoteBio = profile.bio;
        await supabase
          .from('profiles')
          .update({
            bio: remoteBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('[AccountSyncService] Cloud TOTP sync error:', err);
      }
    }
  }

  /**
   * Removes TOTP Two-Factor Authenticator from local storage and Cloud Profile
   */
  public static async removeTotpSecret(profile: UserProfile): Promise<void> {
    localStorage.removeItem('shongjog_2fa_secret');
    localStorage.removeItem('shongjog_2fa_enabled');
    localStorage.removeItem('shongjog_2fa_verified');

    const db = await getDatabase();
    let baseBio = profile.bio || 'Available on Shongjog direct network';
    baseBio = baseBio.replace(/\s*__totp:[A-Za-z0-9]+/g, '').trim();
    profile.bio = baseBio;
    profile.updatedAt = Date.now();
    await db.put('profiles', profile);

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        await supabase
          .from('profiles')
          .update({
            bio: baseBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('[AccountSyncService] Cloud TOTP removal error:', err);
      }
    }
  }

  /**
   * Bundles all user settings and syncs to local storage and Cloud Profile
   */
  public static async syncSettings(profile: UserProfile, partial: Partial<SyncedSettingsPayload> = {}): Promise<void> {
    const currentTheme = partial.theme || localStorage.getItem('shongjog_theme') || 'sovereign-emerald';
    const currentWallpaper = partial.wallpaper || localStorage.getItem('shongjog_wallpaper') || 'mesh-gradient-emerald';
    const currentFontSize = partial.fontSize || localStorage.getItem('shongjog_font_size') || 'standard';
    const currentBubbleStyle = partial.bubbleStyle || localStorage.getItem('shongjog_bubble_style') || 'modern';
    const currentSoundFx = partial.soundFx !== undefined ? partial.soundFx : localStorage.getItem('shongjog_sound_fx') !== 'false';
    const currentFxVol = partial.fxVol !== undefined ? partial.fxVol : Number(localStorage.getItem('shongjog_fx_vol') || '0.7');
    const currentEnterIsSend = partial.enterIsSend !== undefined ? partial.enterIsSend : localStorage.getItem('shongjog_enter_is_send') === 'true';
    const currentMediaAutoDownload = partial.mediaAutoDownload !== undefined ? partial.mediaAutoDownload : localStorage.getItem('shongjog_media_auto_download') !== 'false';
    const currentNotifMessages = partial.notifMessages !== undefined ? partial.notifMessages : localStorage.getItem('shongjog_notif_messages') !== 'false';
    const currentNotifSounds = partial.notifSounds !== undefined ? partial.notifSounds : localStorage.getItem('shongjog_notif_sounds') !== 'false';
    const currentNotifPreviews = partial.notifPreviews !== undefined ? partial.notifPreviews : localStorage.getItem('shongjog_notif_previews') !== 'false';
    const currentReadReceipts = partial.readReceipts !== undefined ? partial.readReceipts : localStorage.getItem('shongjog_read_receipts') !== 'false';
    const currentPrivacyLastSeen = partial.privacyLastSeen || localStorage.getItem('shongjog_privacy_last_seen') || 'everyone';

    // Save to localStorage
    localStorage.setItem('shongjog_theme', currentTheme);
    localStorage.setItem('shongjog_wallpaper', currentWallpaper);
    localStorage.setItem('shongjog_font_size', currentFontSize);
    localStorage.setItem('shongjog_bubble_style', currentBubbleStyle);
    localStorage.setItem('shongjog_sound_fx', String(currentSoundFx));
    localStorage.setItem('shongjog_fx_vol', String(currentFxVol));
    localStorage.setItem('shongjog_enter_is_send', String(currentEnterIsSend));
    localStorage.setItem('shongjog_media_auto_download', String(currentMediaAutoDownload));
    localStorage.setItem('shongjog_notif_messages', String(currentNotifMessages));
    localStorage.setItem('shongjog_notif_sounds', String(currentNotifSounds));
    localStorage.setItem('shongjog_notif_previews', String(currentNotifPreviews));
    localStorage.setItem('shongjog_read_receipts', String(currentReadReceipts));
    localStorage.setItem('shongjog_privacy_last_seen', currentPrivacyLastSeen);

    const payload: SyncedSettingsPayload = {
      theme: currentTheme,
      wallpaper: currentWallpaper,
      fontSize: currentFontSize,
      bubbleStyle: currentBubbleStyle,
      soundFx: currentSoundFx,
      fxVol: currentFxVol,
      enterIsSend: currentEnterIsSend,
      mediaAutoDownload: currentMediaAutoDownload,
      notifMessages: currentNotifMessages,
      notifSounds: currentNotifSounds,
      notifPreviews: currentNotifPreviews,
      readReceipts: currentReadReceipts,
      privacyLastSeen: currentPrivacyLastSeen,
      updatedAt: Date.now(),
    };

    // Update profile in IndexedDB
    const db = await getDatabase();
    profile.syncedSettings = payload;
    profile.updatedAt = Date.now();
    await db.put('profiles', profile);

    // Sync to Supabase cloud profile
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let remoteBio = profile.bio || 'Available on Shongjog direct network';
        remoteBio = remoteBio.replace(/\s*__settings:[A-Za-z0-9%_-]+/, '').trim();
        const encoded = encodeURIComponent(JSON.stringify(payload));
        remoteBio = `${remoteBio} __settings:${encoded}`;

        await supabase
          .from('profiles')
          .update({
            bio: remoteBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('[AccountSyncService] Cloud settings sync error:', err);
      }
    }
  }

  /**
   * Pulls down all cloud account data (PIN, settings, messages, contacts) and harmonizes local device
   */
  public static async syncAllFromCloud(profile: UserProfile): Promise<any> {
    return this.syncDownAccountData(profile);
  }

  public static async syncDownAccountData(
    profile: UserProfile,
    onProgress?: (msg: string) => void
  ): Promise<{
    pinSynced: boolean;
    settingsSynced: boolean;
    messagesCount: number;
    contactsCount: number;
  }> {
    let pinSynced = false;
    let settingsSynced = false;

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('profiles')
          .select('bio, avatar_url, display_name, username, updated_at')
          .eq('id', profile.id)
          .maybeSingle();

        if (data && data.bio) {
          // 1. Sync Chat Lock PIN
          const pinMatch = data.bio.match(/__lockpin:([0-9]{6})/);
          if (pinMatch) {
            const cloudPin = pinMatch[1];
            localStorage.setItem('shongjog_chat_pin', cloudPin);
            localStorage.setItem('shongjog_device_pin', cloudPin);
            profile.chatLockPin = cloudPin;
            pinSynced = true;
          }

          // 1b. Sync Two-Factor Authenticator (TOTP)
          const totpMatch = data.bio.match(/__totp:([A-Za-z0-9]+)/);
          if (totpMatch) {
            const secret = totpMatch[1].toUpperCase();
            localStorage.setItem('shongjog_2fa_secret', secret);
            localStorage.setItem('shongjog_2fa_enabled', 'true');
            localStorage.setItem('shongjog_2fa_verified', 'true');
          }

          // 2. Sync Settings
          const settingsMatch = data.bio.match(/__settings:([A-Za-z0-9%_-]+)/);
          if (settingsMatch) {
            try {
              const decoded = JSON.parse(decodeURIComponent(settingsMatch[1])) as SyncedSettingsPayload;
              if (decoded.theme) localStorage.setItem('shongjog_theme', decoded.theme);
              if (decoded.wallpaper) localStorage.setItem('shongjog_wallpaper', decoded.wallpaper);
              if (decoded.fontSize) localStorage.setItem('shongjog_font_size', decoded.fontSize);
              if (decoded.bubbleStyle) localStorage.setItem('shongjog_bubble_style', decoded.bubbleStyle);
              if (decoded.soundFx !== undefined) localStorage.setItem('shongjog_sound_fx', String(decoded.soundFx));
              if (decoded.fxVol !== undefined) localStorage.setItem('shongjog_fx_vol', String(decoded.fxVol));
              if (decoded.enterIsSend !== undefined) localStorage.setItem('shongjog_enter_is_send', String(decoded.enterIsSend));
              if (decoded.mediaAutoDownload !== undefined) localStorage.setItem('shongjog_media_auto_download', String(decoded.mediaAutoDownload));
              if (decoded.notifMessages !== undefined) localStorage.setItem('shongjog_notif_messages', String(decoded.notifMessages));
              if (decoded.notifSounds !== undefined) localStorage.setItem('shongjog_notif_sounds', String(decoded.notifSounds));
              if (decoded.notifPreviews !== undefined) localStorage.setItem('shongjog_notif_previews', String(decoded.notifPreviews));
              if (decoded.readReceipts !== undefined) localStorage.setItem('shongjog_read_receipts', String(decoded.readReceipts));
              if (decoded.privacyLastSeen) localStorage.setItem('shongjog_privacy_last_seen', decoded.privacyLastSeen);

              profile.syncedSettings = decoded;
              settingsSynced = true;
            } catch (pErr) {
              console.warn('[AccountSyncService] Parse settings error:', pErr);
            }
          }

          // 3. Update profile avatar and info if changed on another device
          if (data.avatar_url && data.avatar_url !== profile.avatarUrl) {
            profile.avatarUrl = data.avatar_url;
          }
          if (data.display_name && data.display_name !== profile.displayName) {
            profile.displayName = data.display_name;
          }
          if (data.username && data.username !== profile.username) {
            profile.username = data.username;
          }

          const db = await getDatabase();
          await db.put('profiles', profile);
        }
      } catch (err) {
        console.warn('[AccountSyncService] Profile metadata sync error:', err);
      }
    }

    // 4. Perform cloud messages & contacts restore
    let restoreRes = { messagesCount: 0, contactsCount: 0 };
    try {
      if (navigator.onLine && isConfigured) {
        const res = await RecoverySyncService.performFullCloudRestoreAndSync(profile, onProgress);
        restoreRes = {
          messagesCount: res.messagesCount,
          contactsCount: res.contactsCount,
        };
      }
    } catch (rErr) {
      console.warn('[AccountSyncService] Message sync error:', rErr);
    }

    // 5. Deduplicate all contacts and conversations cleanly
    await IdentityService.cleanupDuplicateContacts();

    return {
      pinSynced,
      settingsSynced,
      messagesCount: restoreRes.messagesCount,
      contactsCount: restoreRes.contactsCount,
    };
  }
}
