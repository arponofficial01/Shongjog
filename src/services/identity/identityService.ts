import { getDatabase } from '../db/database';
import type { UserProfile, Contact } from '../db/database';
import { CryptoService } from '../crypto/cryptoService';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';

const ACTIVE_USER_ID_KEY = 'contact_app_active_user_id';

export class IdentityService {
  /**
   * Validates a Bangladesh phone number format.
   * Expected: +8801[3-9]XXXXXXXX (11 digits local: 013-019XXXXXXXX)
   */
  public static validateBangladeshPhone(phone: string): { isValid: boolean; formatted: string; error?: string } {
    let clean = phone.replace(/[\s-]/g, '');
    if (clean.startsWith('00880')) clean = '+' + clean.substring(2);
    if (clean.startsWith('880')) clean = '+' + clean;
    if (clean.startsWith('01')) clean = '+880' + clean.substring(1);

    const bdRegex = /^\+8801[3-9]\d{8}$/;
    if (!bdRegex.test(clean)) {
      return {
        isValid: false,
        formatted: clean,
        error: 'Please enter a valid Bangladesh phone number (e.g., 01712345678 or +8801712345678)',
      };
    }
    return { isValid: true, formatted: clean };
  }

  /**
   * Validates a username (3-24 characters, alphanumeric and underscore)
   */
  public static validateUsername(username: string): { isValid: boolean; formatted: string; error?: string } {
    const clean = username.trim().toLowerCase();
    const userRegex = /^[a-z0-9_]{3,24}$/;
    if (!userRegex.test(clean)) {
      return {
        isValid: false,
        formatted: clean,
        error: 'Username must be 3-24 characters, lowercase alphanumeric or underscore',
      };
    }
    return { isValid: true, formatted: clean };
  }

  /**
   * Gets the currently active logged-in profile from IndexedDB.
   */
  public static async getActiveProfile(): Promise<UserProfile | null> {
    const activeId = localStorage.getItem(ACTIVE_USER_ID_KEY);
    if (!activeId) return null;

    const db = await getDatabase();
    const profile = await db.get('profiles', activeId);
    return profile || null;
  }

  /**
   * Creates or signs into a local identity profile with cryptographic keys.
   * Works fully offline without an internet connection!
   */
  public static async setupProfile(
    phoneNumber: string,
    username: string,
    displayName: string,
    avatarUrl?: string
  ): Promise<UserProfile> {
    const phoneVal = this.validateBangladeshPhone(phoneNumber);
    if (!phoneVal.isValid) throw new Error(phoneVal.error);

    const userVal = this.validateUsername(username);
    if (!userVal.isValid) throw new Error(userVal.error);

    const { publicKeyBase64 } = await CryptoService.getOrCreateIdentityKeyPair();
    const deviceId = CryptoService.getOrCreateDeviceId();

    const db = await getDatabase();
    let existing = await this.getActiveProfile();

    const userId = existing ? existing.id : crypto.randomUUID();
    const now = Date.now();

    const profile: UserProfile = {
      id: userId,
      phoneNumber: phoneVal.formatted,
      username: userVal.formatted,
      displayName: displayName.trim(),
      avatarUrl,
      publicKey: publicKeyBase64,
      deviceId,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    await db.put('profiles', profile);
    localStorage.setItem(ACTIVE_USER_ID_KEY, profile.id);

    // If online & Supabase configured, attempt remote sync
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        await supabase.from('profiles').upsert({
          id: profile.id,
          phone_number: profile.phoneNumber,
          username: profile.username,
          display_name: profile.displayName,
          avatar_url: profile.avatarUrl,
          public_key: profile.publicKey,
          device_id: profile.deviceId,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Supabase remote profile sync queued for later', err);
      }
    }

    return profile;
  }

  /**
   * Log out active profile
   */
  public static async logout(): Promise<void> {
    localStorage.removeItem(ACTIVE_USER_ID_KEY);
  }

  // --- Contact Directory Methods ---

  public static async getAllContacts(): Promise<Contact[]> {
    const db = await getDatabase();
    return await db.getAll('contacts');
  }

  public static async getContactById(id: string): Promise<Contact | null> {
    const db = await getDatabase();
    return (await db.get('contacts', id)) || null;
  }

  public static async saveContact(contact: Contact): Promise<void> {
    const db = await getDatabase();
    await db.put('contacts', contact);
  }

  public static async addContact(
    phoneNumber: string,
    displayName: string,
    username?: string,
    publicKey?: string
  ): Promise<Contact> {
    const phoneVal = this.validateBangladeshPhone(phoneNumber);
    if (!phoneVal.isValid) throw new Error(phoneVal.error);

    const db = await getDatabase();
    const contactId = crypto.randomUUID();

    const newContact: Contact = {
      id: contactId,
      phoneNumber: phoneVal.formatted,
      displayName: displayName.trim(),
      username: username ? username.trim().toLowerCase() : '',
      publicKey,
      isBlocked: false,
      lastSeen: Date.now(),
    };

    await db.put('contacts', newContact);

    // If Supabase is online, attempt to search and match global profile
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('profiles')
          .select('id, public_key, username, display_name, avatar_url')
          .eq('phone_number', phoneVal.formatted)
          .single();

        if (data) {
          newContact.publicKey = data.public_key || newContact.publicKey;
          newContact.username = data.username || newContact.username;
          newContact.avatarUrl = data.avatar_url;
          await db.put('contacts', newContact);
        }
      } catch (err) {
        // Safe fallback: contact exists locally in offline address book
      }
    }

    return newContact;
  }

  public static async toggleBlockContact(contactId: string): Promise<boolean> {
    const db = await getDatabase();
    const contact = await db.get('contacts', contactId);
    if (!contact) return false;

    contact.isBlocked = !contact.isBlocked;
    await db.put('contacts', contact);
    return contact.isBlocked;
  }
}
