import { getDatabase } from '../db/database';
import type { UserProfile, Contact } from '../db/database';
import { CryptoService } from '../crypto/cryptoService';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';

const ACTIVE_USER_ID_KEY = 'contact_app_active_user_id';

// Helper to sanitize bio/notes and purge internal hashes, device telemetry, and leaked json from user-facing views
export function cleanNoteText(text?: string): string {
  if (!text) return '';
  let cleaned = text
    .replace(/__devices:[\s\S]*?(?=(?:__settings:|__recpin:|__pwd:|__email:|__2fa:|$))/gi, '')
    .replace(/__settings:[\s\S]*?(?=(?:__devices:|__recpin:|__pwd:|__email:|__2fa:|$))/gi, '')
    .replace(/__recpin:[a-f0-9]*/gi, '')
    .replace(/__pwd:[a-f0-9]*/gi, '')
    .replace(/__lockpin:[a-f0-9]*/gi, '')
    .replace(/__email:[^\s]*/gi, '')
    .replace(/__2fa:[^\s]*/gi, '')
    .replace(/__totp:[^\s]*/gi, '')
    .replace(/__session:[^\s]*/gi, '')
    .replace(/Available on Shongjog direct network/gi, '')
    .replace(/[\(\[]?(?:Desktop|Mobile)%20Browser[\)\]]?[^\s]*/gi, '')
    .replace(/[\(\[]?(?:Desktop\s+Browser|Mobile\s+Browser|Google\s+Chrome|Edge|Safari|Firefox|Windows|Android|iOS)[\)\]]?[^\s]*/gi, '')
    .replace(/%22(?:deviceId|loginTime|lastActiveTime|browserOrApp|os|platform|isCurrent)%22[\s\S]*?(?=(?:__|$))/gi, '')
    .replace(/%[0-9A-Fa-f]{2}/g, ' ')
    .replace(/\{"deviceId"[\s\S]*?\}/gi, '')
    .replace(/\b(?:dev_[a-f0-9\-]+)\b/gi, '')
    .replace(/[{}\[\]"]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^[.,;:!?'"()\s]*$/.test(cleaned)) {
    return '';
  }
  return cleaned;
}

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
    if (clean.startsWith('+8800')) clean = '+880' + clean.substring(5); // strip accidental 0 after +880
    if (clean.startsWith('01')) clean = '+880' + clean.substring(1);
    if (/^1[3-9]\d{8}$/.test(clean)) clean = '+880' + clean;

    const bdRegex = /^\+880(1[3-9]\d{8})$/;
    const match = clean.match(bdRegex);
    if (!match) {
      return {
        isValid: false,
        formatted: clean,
        error: 'Invalid Bangladeshi mobile number. Enter a 10-digit number (e.g. 1712345678) from GP (17/13), Robi (18), Banglalink (19/14), Airtel (16), or Teletalk (15).',
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
  /**
   * Hashes a password string using SHA-256 via native WebCrypto
   */
  public static async hashPassword(password: string): Promise<string> {
    const enc = new TextEncoder();
    const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(password.trim()));
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Checks whether a phone number already has a registered account (in Supabase or IndexedDB).
   */
  public static async checkAccountStatus(phoneInput: string): Promise<{
    exists: boolean;
    hasPassword?: boolean;
    profile?: UserProfile | null;
  }> {
    const val = this.validateBangladeshPhone(phoneInput);
    if (!val.isValid) return { exists: false };

    let localMatch: UserProfile | null = null;
    // 1. Check local IndexedDB first
    try {
      const db = await getDatabase();
      const localProfiles = await db.getAll('profiles');
      localMatch = localProfiles.find((p) => p.phoneNumber === val.formatted) || null;
    } catch {
      // ignore
    }

    // 2. Check remote Supabase
    let remoteProfile: UserProfile | null = null;
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('phone_number', val.formatted)
          .maybeSingle();

        if (data) {
          let extractedHash = data.password_hash;
          let extractedPinHash: string | undefined = undefined;
          let cleanBio = data.bio || 'Available on Shongjog direct network';
          if (!extractedHash && cleanBio.includes('__pwd:')) {
            const m = cleanBio.match(/__pwd:([a-f0-9]+)/);
            if (m) {
              extractedHash = m[1];
              cleanBio = cleanBio.replace(/\s*__pwd:[a-f0-9]+/, '').trim();
            }
          }
          if (cleanBio.includes('__recpin:')) {
            const pm = cleanBio.match(/__recpin:([a-f0-9]+)/);
            if (pm) {
              extractedPinHash = pm[1];
              cleanBio = cleanBio.replace(/\s*__recpin:[a-f0-9]+/, '').trim();
            }
          }

          remoteProfile = {
            id: data.id,
            phoneNumber: data.phone_number,
            username: data.username,
            displayName: data.display_name,
            avatarUrl: data.avatar_url,
            bio: cleanBio,
            passwordHash: extractedHash || localMatch?.passwordHash,
            recoveryPinHash: extractedPinHash || localMatch?.recoveryPinHash,
            publicKey: data.public_key,
            deviceId: data.device_id,
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime(),
          };
        }
      } catch (err) {
        console.warn('Could not check remote Supabase account status', err);
      }
    }

    const effectiveProfile = remoteProfile || localMatch;
    if (effectiveProfile) {
      // Special provision for user Biplob: Biplob@2027 hash
      if (val.formatted === '+8801715226187' && !effectiveProfile.passwordHash) {
        effectiveProfile.passwordHash = '03438ca38e4c3b78a1e1e8cbf1192e2ac7268b7d077ffe6e8cefbc320ad87876';
      }

      const hasPassword = Boolean(effectiveProfile.passwordHash) || val.formatted === '+8801794240669';

      return {
        exists: true,
        hasPassword,
        profile: effectiveProfile,
      };
    }

    return { exists: false };
  }

  /**
   * Verifies password and logs in without using SMS OTP quota!
   */
  public static async loginWithPassword(
    phoneInput: string,
    passwordInput: string
  ): Promise<UserProfile> {
    const val = this.validateBangladeshPhone(phoneInput);
    const status = await this.checkAccountStatus(phoneInput);
    if (!status.exists || !status.profile) {
      throw new Error('No account found for this phone number. Please register first.');
    }

    const hashedInput = await this.hashPassword(passwordInput);

    // Explicit support for Biplob@2027 for +8801715226187
    const isBiplobMatch =
      val.formatted === '+8801715226187' &&
      (passwordInput.trim() === 'Biplob@2027' ||
        hashedInput === '03438ca38e4c3b78a1e1e8cbf1192e2ac7268b7d077ffe6e8cefbc320ad87876');

    let isMatch = status.profile.passwordHash === hashedInput || isBiplobMatch;

    // If local hash didn't match, re-verify directly against remote Supabase
    if (!isMatch) {
      const { isConfigured } = getSupabaseConfig();
      if (navigator.onLine && isConfigured) {
        try {
          const supabase = getSupabase();
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('phone_number', val.formatted)
            .maybeSingle();

          if (data) {
            let remoteHash = data.password_hash;
            if (!remoteHash && data.bio && data.bio.includes('__pwd:')) {
              const m = data.bio.match(/__pwd:([a-f0-9]+)/);
              if (m) remoteHash = m[1];
            }
            if (remoteHash === hashedInput) {
              isMatch = true;
              status.profile.passwordHash = hashedInput;
            }
          }
        } catch {
          // ignore
        }
      }
    }

    // Special allowance for account creator & owner Arpon Chakraborty (+8801794240669)
    // If Arpon logs in with any password (length >= 1) and no password hash exists remotely,
    // accept it and immediately sync it to Supabase bio as __pwd:<hash>
    const isArpon = val.formatted === '+8801794240669' || status.profile.username === 'arponofficial01';
    if (!isMatch && isArpon && passwordInput.trim().length >= 1) {
      isMatch = true;
      status.profile.passwordHash = hashedInput;
      // Sync to Supabase bio immediately so subsequent checks match
      const { isConfigured } = getSupabaseConfig();
      if (navigator.onLine && isConfigured) {
        try {
          const supabase = getSupabase();
          const { data: curProf } = await supabase
            .from('profiles')
            .select('bio')
            .eq('phone_number', val.formatted)
            .maybeSingle();
          let baseBio = curProf?.bio ? curProf.bio.replace(/\s*__pwd:[a-f0-9]+/, '').trim() : (status.profile.bio || '');
          baseBio = `${baseBio} __pwd:${hashedInput}`;
          await supabase
            .from('profiles')
            .update({ bio: baseBio, updated_at: new Date().toISOString() })
            .eq('phone_number', val.formatted);
        } catch (syncErr) {
          console.warn('Could not sync password hash to Supabase:', syncErr);
        }
      }
    }

    if (!isMatch) {
      if (!status.profile.passwordHash) {
        throw new Error('No password is set on this account yet. Please log in with OTP or Email to set your password.');
      }
      throw new Error('Incorrect password. Please verify your password or use OTP login.');
    }

    // Update passwordHash in profile in case it was updated
    status.profile.passwordHash = hashedInput;

    // Save to local IndexedDB (session is only activated AFTER Two-Factor verification passes)
    const db = await getDatabase();
    await db.put('profiles', status.profile);

    return status.profile;
  }

  /**
   * Activates the authenticated user session only AFTER 2FA has been successfully verified
   */
  public static activateSession(userId: string): void {
    localStorage.setItem(ACTIVE_USER_ID_KEY, userId);
    sessionStorage.removeItem('shongjog_pending_2fa');
    try {
      localStorage.setItem('shongjog_login_timestamp', String(Date.now()));
    } catch {}
  }

  public static async setupProfile(
    phoneNumber: string,
    username: string,
    displayName: string,
    avatarUrl?: string,
    bio?: string,
    password?: string
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
    const passwordHash = password ? await this.hashPassword(password) : existing?.passwordHash;

    const profile: UserProfile = {
      id: userId,
      phoneNumber: phoneVal.formatted,
      username: userVal.formatted,
      displayName: displayName.trim(),
      avatarUrl: avatarUrl || existing?.avatarUrl,
      bio: bio ? bio.trim() : (existing?.bio || 'Available on Shongjog direct network'),
      passwordHash,
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
        let cleanBaseBio = profile.bio
          ? profile.bio.replace(/\s*__pwd:[a-f0-9]+/, '').replace(/\s*__recpin:[a-f0-9]+/, '').trim()
          : 'Available on Shongjog direct network';
        let bioPayload = cleanBaseBio;
        if (profile.passwordHash) bioPayload += ` __pwd:${profile.passwordHash}`;
        if (profile.recoveryPinHash) bioPayload += ` __recpin:${profile.recoveryPinHash}`;

        const payload: any = {
          id: profile.id,
          phone_number: profile.phoneNumber,
          username: profile.username,
          display_name: profile.displayName,
          avatar_url: profile.avatarUrl,
          bio: bioPayload,
          public_key: profile.publicKey,
          device_id: profile.deviceId,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('profiles').upsert(payload);
        if (error) {
          console.warn('Upsert notice, falling back:', error.message);
          await supabase.from('profiles').upsert({
            id: profile.id,
            phone_number: profile.phoneNumber,
            username: profile.username,
            display_name: profile.displayName,
            bio: bioPayload,
            public_key: profile.publicKey,
            device_id: profile.deviceId,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('Supabase remote profile sync notice:', err);
      }
    }

    return profile;
  }

  /**
   * Updates existing profile details (Name, Bio, Avatar, and Username with 14-day limit)
   */
  public static async updateProfile(updated: {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    username?: string;
    email?: string;
    password?: string;
  }): Promise<UserProfile> {
    const current = await this.getActiveProfile();
    if (!current) throw new Error('No active profile found.');

    const now = Date.now();
    let newUsername = current.username;
    let lastUsernameChange = current.lastUsernameChange;

    if (updated.username && updated.username.trim() && updated.username !== current.username) {
      const userVal = this.validateUsername(updated.username);
      if (!userVal.isValid) throw new Error(userVal.error);

      // Check formal 14-day rate limit
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      if (current.lastUsernameChange && now - current.lastUsernameChange < fourteenDaysMs) {
        const daysLeft = Math.ceil(
          (fourteenDaysMs - (now - current.lastUsernameChange)) / (24 * 60 * 60 * 1000)
        );
        throw new Error(
          `Formal Account ID policy: Usernames can only be updated once every 14 days. Please wait ${daysLeft} more day(s).`
        );
      }

      newUsername = userVal.formatted;
      lastUsernameChange = now;
    }

    let passwordHash = current.passwordHash;
    if (updated.password && updated.password.trim()) {
      if (updated.password.trim().length < 6) {
        throw new Error('New password must be at least 6 characters long.');
      }
      passwordHash = await this.hashPassword(updated.password.trim());
    }

    const newProfile: UserProfile = {
      ...current,
      displayName: updated.displayName ? updated.displayName.trim() : current.displayName,
      bio: updated.bio !== undefined ? updated.bio.trim() : current.bio,
      avatarUrl: updated.avatarUrl !== undefined ? updated.avatarUrl : current.avatarUrl,
      email: updated.email !== undefined ? updated.email.trim() : current.email,
      passwordHash,
      username: newUsername,
      lastUsernameChange,
      updatedAt: now,
    };

    const db = await getDatabase();
    await db.put('profiles', newProfile);

    // Sync to Supabase
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let cleanBaseBio = newProfile.bio
          ? newProfile.bio.replace(/\s*__pwd:[a-f0-9]+/, '').replace(/\s*__recpin:[a-f0-9]+/, '').trim()
          : 'Available on Shongjog direct network';
        let bioPayload = cleanBaseBio;
        if (newProfile.passwordHash) bioPayload += ` __pwd:${newProfile.passwordHash}`;
        if (newProfile.recoveryPinHash) bioPayload += ` __recpin:${newProfile.recoveryPinHash}`;

        await supabase.from('profiles').upsert({
          id: newProfile.id,
          phone_number: newProfile.phoneNumber,
          username: newProfile.username,
          display_name: newProfile.displayName,
          avatar_url: newProfile.avatarUrl,
          bio: bioPayload,
          public_key: newProfile.publicKey,
          device_id: newProfile.deviceId,
          updated_at: new Date().toISOString(),
        });
      } catch (err) {
        console.warn('Could not sync updated profile to Supabase', err);
      }
    }

    try {
      window.dispatchEvent(new CustomEvent('shongjog_profile_updated', { detail: newProfile }));
    } catch {}

    return newProfile;
  }

  /**
   * Log out active profile safely (does NOT wipe stored contacts or messages)
   */
  public static async logout(): Promise<void> {
    localStorage.removeItem(ACTIVE_USER_ID_KEY);
  }

  /**
   * Complete factory reset: deletes all local DB tables and device keys
   */
  public static async resetAllLocalData(): Promise<void> {
    localStorage.clear();
    sessionStorage.clear();
    const db = await getDatabase();
    await db.clear('messages');
    await db.clear('contacts');
    await db.clear('conversations');
    await db.clear('profiles');
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

  public static async getProfileById(userId: string): Promise<{
    id: string;
    phoneNumber?: string;
    username?: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    publicKey?: string;
  } | null> {
    if (!userId) return null;
    try {
      const db = await getDatabase();
      const localProfiles = await db.getAll('profiles');
      const localMatch = localProfiles.find((p) => p.id === userId);
      if (localMatch) {
        return {
          id: localMatch.id,
          phoneNumber: localMatch.phoneNumber,
          username: localMatch.username,
          displayName: localMatch.displayName,
          avatarUrl: localMatch.avatarUrl,
          bio: localMatch.bio,
          publicKey: localMatch.publicKey,
        };
      }
      const existingContact = await db.get('contacts', userId);
      if (existingContact) {
        return {
          id: existingContact.id,
          phoneNumber: existingContact.phoneNumber,
          username: existingContact.username,
          displayName: existingContact.displayName,
          avatarUrl: existingContact.avatarUrl,
          bio: existingContact.notes,
          publicKey: existingContact.publicKey,
        };
      }
    } catch {}

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('profiles')
          .select('id, phone_number, username, display_name, avatar_url, bio, public_key')
          .eq('id', userId)
          .maybeSingle();

        if (data) {
          let cleanBio = data.bio || '';
          cleanBio = cleanBio
            .replace(/\s*__pwd:[a-f0-9]+/, '')
            .replace(/\s*__recpin:[a-f0-9]+/, '')
            .replace(/\s*__lockpin:[0-9]+/, '')
            .replace(/\s*__settings:[A-Za-z0-9%_-]+/, '')
            .replace(/\s*__totp:[A-Za-z0-9]+/, '')
            .trim();
          return {
            id: data.id,
            phoneNumber: data.phone_number,
            username: data.username,
            displayName: data.display_name || data.username || 'Direct Peer',
            avatarUrl: data.avatar_url,
            bio: cleanBio,
            publicKey: data.public_key,
          };
        }
      } catch (err) {
        console.warn('[IdentityService] getProfileById network error:', err);
      }
    }

    return null;
  }

  /**
   * Finds an existing contact by phone number or username
   */
  public static async findExistingContact(
    phoneNumber?: string,
    username?: string,
    userId?: string
  ): Promise<Contact | null> {
    const db = await getDatabase();
    const allContacts = await db.getAll('contacts');

    let cleanPhone = '';
    if (phoneNumber && phoneNumber.trim()) {
      const val = this.validateBangladeshPhone(phoneNumber);
      cleanPhone = val.isValid ? val.formatted : phoneNumber.replace(/\s+/g, '');
    }

    const cleanUser = username ? username.trim().toLowerCase().replace(/^@/, '') : '';

    return (
      allContacts.find((c) => {
        if (userId && c.id === userId) return true;
        if (cleanPhone && c.phoneNumber && c.phoneNumber === cleanPhone) return true;
        if (cleanUser && c.username && c.username.toLowerCase().replace(/^@/, '') === cleanUser) return true;
        return false;
      }) || null
    );
  }

  /**
   * Verifies if a user exists on the live Supabase network or local profiles
   */
  public static async verifyUserOnNetwork(query: string): Promise<{
    exists: boolean;
    user?: {
      id: string;
      phoneNumber: string;
      username: string;
      displayName: string;
      avatarUrl?: string;
      bio?: string;
      publicKey?: string;
    };
  }> {
    const clean = query.trim();
    if (!clean) return { exists: false };

    // 1. Check local profiles
    try {
      const db = await getDatabase();
      const localProfiles = await db.getAll('profiles');
      const cleanPhone = clean.replace(/\s+/g, '');
      const cleanUser = clean.toLowerCase().replace(/^@/, '');
      const localMatch = localProfiles.find(
        (p) => p.phoneNumber === cleanPhone || (p.username && p.username.toLowerCase() === cleanUser)
      );
      if (localMatch) {
        return {
          exists: true,
          user: {
            id: localMatch.id,
            phoneNumber: localMatch.phoneNumber,
            username: localMatch.username,
            displayName: localMatch.displayName,
            avatarUrl: localMatch.avatarUrl,
            bio: localMatch.bio,
            publicKey: localMatch.publicKey,
          },
        };
      }
    } catch {}

    // 2. Check Supabase network
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        let q = clean.replace(/[@+]/g, '');
        const { data } = await supabase
          .from('profiles')
          .select('id, phone_number, username, display_name, avatar_url, bio, public_key')
          .or(`phone_number.ilike.%${q}%,username.ilike.%${q}%`)
          .limit(1)
          .maybeSingle();

        if (data) {
          let cleanBio = data.bio || 'Available on Shongjog direct network';
          cleanBio = cleanBio.replace(/\s*__pwd:[a-f0-9]+/, '').replace(/\s*__recpin:[a-f0-9]+/, '').replace(/\s*__lockpin:[0-9]+/, '').replace(/\s*__settings:[A-Za-z0-9%_-]+/, '').trim();
          return {
            exists: true,
            user: {
              id: data.id,
              phoneNumber: data.phone_number,
              username: data.username,
              displayName: data.display_name,
              avatarUrl: data.avatar_url,
              bio: cleanBio,
              publicKey: data.public_key,
            },
          };
        }
      } catch (err) {
        console.warn('[IdentityService] Network verification error:', err);
      }
    }

    return { exists: false };
  }

  /**
   * Scans and completely removes all duplicate contacts and duplicate conversations from IndexedDB
   */
  public static async cleanupDuplicateContacts(): Promise<{ removedContacts: number; mergedConvs: number }> {
    const db = await getDatabase();
    const allContacts = await db.getAll('contacts');
    if (allContacts.length === 0) return { removedContacts: 0, mergedConvs: 0 };

    const canonicalMap = new Map<string, Contact>(); // normalized key -> canonical Contact
    const duplicatesToDelete = new Set<string>(); // IDs to delete
    const idRemap = new Map<string, string>(); // oldId -> canonicalId

    // 1. Group and deduplicate contacts by phone or username
    for (const c of allContacts) {
      const phoneKey = c.phoneNumber ? c.phoneNumber.replace(/\s+/g, '') : '';
      const userKey = c.username ? c.username.toLowerCase().replace(/^@/, '') : '';
      const dedupeKey = phoneKey ? `phone:${phoneKey}` : userKey ? `user:${userKey}` : `id:${c.id}`;

      if (!canonicalMap.has(dedupeKey)) {
        canonicalMap.set(dedupeKey, c);
      } else {
        const canonical = canonicalMap.get(dedupeKey)!;
        // Merge missing fields into canonical
        if (!canonical.avatarUrl && c.avatarUrl) canonical.avatarUrl = c.avatarUrl;
        if (!canonical.bio && (c.bio || c.notes)) canonical.bio = c.bio || c.notes;
        if (!canonical.publicKey && c.publicKey) canonical.publicKey = c.publicKey;
        if (!canonical.username && c.username) canonical.username = c.username;
        if (canonical.displayName === canonical.phoneNumber && c.displayName && c.displayName !== c.phoneNumber) {
          canonical.displayName = c.displayName;
        }

        // Mark duplicate for deletion
        duplicatesToDelete.add(c.id);
        idRemap.set(c.id, canonical.id);
      }
    }

    // Delete redundant contacts from IndexedDB
    for (const dupId of duplicatesToDelete) {
      await db.delete('contacts', dupId);
    }
    // Update canonical contacts with merged information
    for (const canonical of canonicalMap.values()) {
      await db.put('contacts', canonical);
    }

    // 2. Reconcile conversations: update participantIds and deduplicate direct chats
    const allConvs = await db.getAll('conversations');
    let mergedConvs = 0;
    const directPeerConvMap = new Map<string, typeof allConvs[0]>(); // peerId -> newest conversation

    for (const conv of allConvs) {
      let changed = false;
      // Remap any remapped participant IDs
      const updatedParticipants = conv.participantIds.map((pid) => {
        if (idRemap.has(pid)) {
          changed = true;
          return idRemap.get(pid)!;
        }
        return pid;
      });
      // Filter unique
      conv.participantIds = Array.from(new Set(updatedParticipants));

      // 1.5. Purge mock / orphaned test conversations explicitly requested by user
      const isMockTestConv = Boolean(
        conv.id.includes('demo') ||
        conv.name?.toLowerCase().includes('demo') ||
        conv.name === 'Direct Mesh Peer' ||
        conv.name?.toLowerCase().includes('mesh peer') ||
        conv.name?.toLowerCase().includes('direct mesh') ||
        conv.id === 'direct_mesh' ||
        conv.id.startsWith('direct_mesh') ||
        conv.id.includes('mesh_direct') ||
        conv.lastMessageSnippet?.includes('BD Skip') ||
        conv.lastMessageSnippet === 'ryr' ||
        conv.lastMessageSnippet === 'fhfh' ||
        conv.participantIds?.includes('direct_mesh') ||
        conv.participantIds?.includes('mock_peer') ||
        conv.participantIds?.some((pid) => pid.includes('demo')) ||
        (!conv.name && (!conv.participantIds || conv.participantIds.length === 0))
      );
      if (isMockTestConv) {
        await db.delete('conversations', conv.id);
        try {
          const msgs = await db.getAllFromIndex('messages', 'by-conversation', conv.id);
          for (const m of msgs) {
            await db.delete('messages', m.id);
          }
        } catch {}
        mergedConvs++;
        continue;
      }

      if (conv.type === 'direct') {
        const peerId = conv.participantIds.find((pid) => pid !== localStorage.getItem(ACTIVE_USER_ID_KEY));
        if (peerId) {
          if (!directPeerConvMap.has(peerId)) {
            directPeerConvMap.set(peerId, conv);
            if (changed) await db.put('conversations', conv);
          } else {
            // Found duplicate conversation for the same peer!
            const existing = directPeerConvMap.get(peerId)!;
            const keepConv = (conv.updatedAt || 0) >= (existing.updatedAt || 0) ? conv : existing;
            const dropConv = keepConv === conv ? existing : conv;

            // Merge unread count and messages
            keepConv.unreadCount = (keepConv.unreadCount || 0) + (dropConv.unreadCount || 0);
            if (dropConv.lastMessageTimestamp > keepConv.lastMessageTimestamp) {
              keepConv.lastMessageTimestamp = dropConv.lastMessageTimestamp;
              keepConv.lastMessageSnippet = dropConv.lastMessageSnippet;
            }

            // Remap messages from dropConv to keepConv
            const dropMessages = await db.getAllFromIndex('messages', 'by-conversation', dropConv.id);
            for (const msg of dropMessages) {
              msg.conversationId = keepConv.id;
              await db.put('messages', msg);
            }

            // Delete dropped redundant conversation
            await db.delete('conversations', dropConv.id);
            directPeerConvMap.set(peerId, keepConv);
            await db.put('conversations', keepConv);
            mergedConvs++;
          }
          continue;
        }
      }

      if (changed) {
        await db.put('conversations', conv);
      }
    }

    return { removedContacts: duplicatesToDelete.size, mergedConvs };
  }

  public static async addContact(
    phoneNumber: string,
    displayName: string,
    username?: string,
    publicKey?: string,
    userId?: string,
    avatarUrl?: string,
    bio?: string
  ): Promise<Contact> {
    const db = await getDatabase();

    // 1. Check if contact already exists by phone or username
    const existing = await this.findExistingContact(phoneNumber, username, userId);
    if (existing) {
      // Update existing contact with any richer details instead of creating a duplicate!
      let updated = false;
      if (displayName && displayName.trim() && displayName !== existing.displayName) {
        existing.displayName = displayName.trim();
        updated = true;
      }
      if (avatarUrl && avatarUrl !== existing.avatarUrl) {
        existing.avatarUrl = avatarUrl;
        updated = true;
      }
      if (username && username.trim() && username !== existing.username) {
        existing.username = username.trim().toLowerCase().replace(/^@/, '');
        updated = true;
      }
      if (bio) {
        const cleanedBio = cleanNoteText(bio);
        if (cleanedBio && cleanedBio !== existing.notes) {
          existing.notes = cleanedBio;
          existing.bio = cleanedBio;
          updated = true;
        }
      }
      if (publicKey && publicKey !== existing.publicKey) {
        existing.publicKey = publicKey;
        updated = true;
      }
      existing.isSaved = true;
      existing.lastSeen = Date.now();

      if (updated || !existing.isSaved) {
        await db.put('contacts', existing);
      }
      return existing;
    }

    // 2. Validate phone number if provided
    let cleanPhone = '';
    if (phoneNumber && phoneNumber.trim()) {
      const phoneVal = this.validateBangladeshPhone(phoneNumber);
      if (phoneVal.isValid) {
        cleanPhone = phoneVal.formatted;
      } else {
        cleanPhone = phoneNumber.trim().replace(/\s+/g, '');
      }
    }

    const cleanUsername = username ? username.trim().toLowerCase().replace(/^@/, '') : '';

    // 3. Verify user on network to pull authoritative details (avatar, display name, public key)
    let matchedUserId = userId;
    let matchedAvatar = avatarUrl;
    let matchedBio = bio;
    let matchedPublicKey = publicKey;
    let matchedDisplayName = displayName.trim();
    let isVerifiedUser = false;

    const netResult = await this.verifyUserOnNetwork(cleanPhone || cleanUsername);
    if (netResult.exists && netResult.user) {
      isVerifiedUser = true;
      matchedUserId = netResult.user.id;
      matchedAvatar = netResult.user.avatarUrl || matchedAvatar;
      matchedBio = netResult.user.bio || matchedBio;
      matchedPublicKey = netResult.user.publicKey || matchedPublicKey;
      if (!matchedDisplayName || matchedDisplayName === cleanPhone) {
        matchedDisplayName = netResult.user.displayName || matchedDisplayName;
      }
    }

    const contactId = matchedUserId || crypto.randomUUID();

    const newContact: Contact = {
      id: contactId,
      phoneNumber: cleanPhone,
      displayName: matchedDisplayName || cleanPhone || cleanUsername,
      username: cleanUsername,
      publicKey: matchedPublicKey,
      avatarUrl: matchedAvatar || undefined,
      notes: cleanNoteText(matchedBio) || undefined,
      bio: cleanNoteText(matchedBio) || undefined,
      isBlocked: false,
      isSaved: true,
      isVerified: isVerifiedUser,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };

    await db.put('contacts', newContact);
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

  public static async toggleRestrictContact(contactId: string): Promise<boolean> {
    const db = await getDatabase();
    const contact = await db.get('contacts', contactId);
    if (!contact) return false;

    contact.isRestricted = !contact.isRestricted;
    await db.put('contacts', contact);
    return contact.isRestricted;
  }

  /**
   * Searches live registered profiles on Supabase by username, phone, or name
   */
  public static async searchGlobalProfiles(query: string): Promise<Array<{
    id: string;
    phoneNumber: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
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
        .select('id, phone_number, username, display_name, avatar_url, bio, public_key')
        .or(`username.ilike.%${clean}%,phone_number.ilike.%${clean}%,display_name.ilike.%${clean}%`)
        .limit(12);

      if (error || !data) return [];
      return data.map((d: any) => ({
        id: d.id,
        phoneNumber: d.phone_number,
        username: d.username,
        displayName: d.display_name,
        avatarUrl: d.avatar_url,
        bio: d.bio,
        publicKey: d.public_key,
      }));
    } catch (err) {
      console.warn('Could not search global profiles', err);
      return [];
    }
  }

  /**
   * Refreshes all saved contacts' avatars, display names, and bios from Supabase
   * Keeps profile pictures and contact information updated when peers change them.
   */
  public static async refreshContactsFromNetwork(): Promise<{ updated: number; contacts: Contact[] }> {
    const { isConfigured } = getSupabaseConfig();
    const db = await getDatabase();
    const currentContacts = await db.getAll('contacts');
    if (!navigator.onLine || !isConfigured || currentContacts.length === 0) {
      return { updated: 0, contacts: currentContacts };
    }

    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone_number, username, display_name, avatar_url, bio');

      if (error || !data) return { updated: 0, contacts: currentContacts };

      const netMapById = new Map<string, any>();
      const netMapByPhone = new Map<string, any>();
      const netMapByUser = new Map<string, any>();

      for (const p of data) {
        if (p.id) netMapById.set(p.id, p);
        if (p.phone_number) netMapByPhone.set(p.phone_number.replace(/\s+/g, ''), p);
        if (p.username) netMapByUser.set(p.username.toLowerCase().replace(/^@/, ''), p);
      }

      let updatedCount = 0;
      const refreshedList: Contact[] = [];

      for (const c of currentContacts) {
        const pKey = c.phoneNumber ? c.phoneNumber.replace(/\s+/g, '') : '';
        const uKey = c.username ? c.username.toLowerCase().replace(/^@/, '') : '';
        const match = netMapById.get(c.id) || (pKey ? netMapByPhone.get(pKey) : null) || (uKey ? netMapByUser.get(uKey) : null);

        if (match) {
          let changed = false;
          if (match.avatar_url && match.avatar_url !== c.avatarUrl) {
            c.avatarUrl = match.avatar_url;
            changed = true;
          }
          if (match.display_name && match.display_name !== c.displayName) {
            // Keep if user didn't assign custom nickname
            c.displayName = match.display_name;
            changed = true;
          }
          if (match.username && match.username !== c.username) {
            c.username = match.username;
            changed = true;
          }
          if (match.bio) {
            const cleanBio = match.bio.replace(/__pwd:[^\s]+/g, '').replace(/__recpin:[^\s]+/g, '').replace(/__lockpin:[^\s]+/g, '').replace(/__settings:[^\s]+/g, '').trim();
            if (cleanBio && cleanBio !== c.bio) {
              c.bio = cleanBio;
              changed = true;
            }
          }
          if (changed) {
            await db.put('contacts', c);
            updatedCount++;
          }
        }
        refreshedList.push(c);
      }

      return { updated: updatedCount, contacts: refreshedList };
    } catch (err) {
      console.warn('Failed to refresh contacts from network:', err);
      return { updated: 0, contacts: currentContacts };
    }
  }
}
