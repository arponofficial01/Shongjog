import { getDatabase } from '../db/database';
import type { UserProfile, Contact } from '../db/database';
import { CryptoService } from '../crypto/cryptoService';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';

const ACTIVE_USER_ID_KEY = 'contact_app_active_user_id';

export class IdentityService {
  /**
   * Validates a Bangladesh mobile phone number.
   * Expected operators: 017/013 (GP), 018 (Robi), 019/014 (Banglalink), 016 (Airtel), 015 (Teletalk).
   */
  public static validateBangladeshPhone(phone: string): {
    isValid: boolean;
    formatted: string;
    operator?: string;
    error?: string;
  } {
    let clean = phone.replace(/[\s\-()]/g, '');
    if (clean.startsWith('00880')) clean = '+' + clean.substring(2);
    if (clean.startsWith('880')) clean = '+' + clean;
    if (clean.startsWith('01')) clean = '+880' + clean.substring(1);

    const bdRegex = /^\+880(1[3-9]\d{8})$/;
    const match = clean.match(bdRegex);
    if (!match) {
      return {
        isValid: false,
        formatted: clean,
        error: 'Invalid Bangladeshi mobile number. Must be an 11-digit number from GP (017/013), Robi (018), Banglalink (019/014), Airtel (016), or Teletalk (015).',
      };
    }

    const local11 = '0' + match[1];
    const prefix = local11.substring(0, 3);
    let operator = 'Bangladesh Mobile Network';
    if (prefix === '017' || prefix === '013') operator = 'Grameenphone';
    else if (prefix === '018') operator = 'Robi';
    else if (prefix === '016') operator = 'Airtel';
    else if (prefix === '019' || prefix === '014') operator = 'Banglalink';
    else if (prefix === '015') operator = 'Teletalk';

    return { isValid: true, formatted: clean, operator };
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

  /**
   * Searches live registered profiles on Supabase by username, phone, or name
   */
  public static async searchGlobalProfiles(query: string): Promise<Array<{
    id: string;
    phoneNumber: string;
    username: string;
    displayName: string;
    publicKey?: string;
  }>> {
    const clean = query.trim().toLowerCase().replace(/[@+]/g, '');
    if (!clean) return [];

    const { isConfigured } = getSupabaseConfig();
    if (!navigator.onLine || !isConfigured) return [];

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone_number, username, display_name, public_key')
        .or(`username.ilike.%${clean}%,phone_number.ilike.%${clean}%,display_name.ilike.%${clean}%`)
        .limit(12);

      if (error || !data) return [];
      return data.map((d: any) => ({
        id: d.id,
        phoneNumber: d.phone_number,
        username: d.username,
        displayName: d.display_name,
        publicKey: d.public_key,
      }));
    } catch (err) {
      console.warn('Could not search global profiles', err);
      return [];
    }
  }
}
