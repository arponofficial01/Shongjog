// Real Device Detection & Multi-Device Session Management (Zero Mocks)
// Accurately detects whether running inside Windows Desktop (Electron), Android APK (Capacitor), or Web Browser

import { getDatabase } from '../db/database';
import type { UserProfile } from '../db/database';
import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';

export interface DeviceSession {
  deviceId: string;
  name: string;
  platform: 'desktop' | 'android' | 'web';
  browserOrApp: string;
  os: string;
  loginTime: number;
  lastActiveTime: number;
  isCurrent: boolean;
}

export class DeviceSessionService {
  private static DEVICE_ID_KEY = 'shongjog_local_device_id';
  private static LOGIN_TIME_KEY = 'shongjog_login_timestamp';

  /**
   * Retrieves or creates a stable persistent unique ID for this device
   */
  public static getOrCreateDeviceId(): string {
    let id = localStorage.getItem(this.DEVICE_ID_KEY);
    if (!id) {
      id = 'dev_' + crypto.randomUUID();
      localStorage.setItem(this.DEVICE_ID_KEY, id);
    }
    return id;
  }

  /**
   * Detects the real device environment, application type, and operating system
   */
  public static detectCurrentDevice(): {
    deviceId: string;
    name: string;
    platform: 'desktop' | 'android' | 'web';
    browserOrApp: string;
    os: string;
  } {
    const deviceId = this.getOrCreateDeviceId();
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isElectron = Boolean(
      (window as any).electronAPI ||
      ua.toLowerCase().includes(' electron/') ||
      (window as any).process?.versions?.electron
    );

    const isCapacitor = Boolean(
      (window as any).Capacitor?.isNativePlatform?.() ||
      (window as any).Capacitor?.platform === 'android'
    );

    // OS Detection
    let os = 'Unknown OS';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    // Platform & App Type Detection
    if (isElectron) {
      return {
        deviceId,
        name: `Windows Desktop App (${os})`,
        platform: 'desktop',
        browserOrApp: 'Shongjog Desktop (EXE)',
        os,
      };
    }

    if (isCapacitor || (/Android/i.test(ua) && !/Chrome\/[.0-9]+ Mobile/i.test(ua))) {
      return {
        deviceId,
        name: `Android Mobile App`,
        platform: 'android',
        browserOrApp: 'Shongjog Android APK',
        os: 'Android',
      };
    }

    // Web Browser Detection
    let browser = 'Web Browser';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Google Chrome';
    else if (/Firefox\//i.test(ua)) browser = 'Mozilla Firefox';
    else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Apple Safari';
    else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';

    const isMobileWeb = /Android|iPhone|iPad/i.test(ua);

    return {
      deviceId,
      name: `${browser} on ${os}`,
      platform: isMobileWeb ? 'android' : 'web',
      browserOrApp: `${browser} (${isMobileWeb ? 'Mobile Web' : 'Desktop Browser'})`,
      os,
    };
  }

  /**
   * Records or updates the login timestamp for this device
   */
  public static recordLogin(): number {
    const now = Date.now();
    localStorage.setItem(this.LOGIN_TIME_KEY, String(now));
    return now;
  }

  public static getLoginTime(): number {
    const stored = localStorage.getItem(this.LOGIN_TIME_KEY);
    return stored ? Number(stored) : Date.now();
  }

  /**
   * Registers this device session to local and Supabase cloud profile
   */
  public static async registerSession(profile: UserProfile): Promise<void> {
    const current = this.detectCurrentDevice();
    const loginTime = this.getLoginTime();
    const thisSession: DeviceSession = {
      deviceId: current.deviceId,
      name: current.name,
      platform: current.platform,
      browserOrApp: current.browserOrApp,
      os: current.os,
      loginTime,
      lastActiveTime: Date.now(),
      isCurrent: true,
    };

    // Parse existing devices from profile bio
    let existingSessions: DeviceSession[] = [];
    if (profile.bio) {
      const match = profile.bio.match(/__devices:([A-Za-z0-9%_-]+)/);
      if (match) {
        try {
          existingSessions = JSON.parse(decodeURIComponent(match[1]));
        } catch {}
      }
    }

    // Filter out duplicate of this device
    existingSessions = existingSessions.filter((s) => s.deviceId !== current.deviceId);
    existingSessions.push(thisSession);

    // Keep up to 6 most recent sessions
    const updatedSessions = existingSessions.slice(-6);

    const encoded = encodeURIComponent(JSON.stringify(updatedSessions));
    let baseBio = profile.bio || 'Available on Shongjog direct network';
    baseBio = baseBio.replace(/\s*__devices:[A-Za-z0-9%_-]+/g, '').trim();
    const newBio = `${baseBio} __devices:${encoded}`;

    profile.bio = newBio;
    profile.deviceId = current.deviceId;
    profile.updatedAt = Date.now();

    try {
      const db = await getDatabase();
      await db.put('profiles', profile);
    } catch {}

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        await supabase
          .from('profiles')
          .update({
            bio: newBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch (err) {
        console.warn('[DeviceSessionService] Cloud device sync warning:', err);
      }
    }
  }

  /**
   * Retrieves the real list of active devices for this account
   */
  public static async getActiveDevices(profile: UserProfile): Promise<DeviceSession[]> {
    const current = this.detectCurrentDevice();
    const currentLoginTime = this.getLoginTime();

    let remoteBio = profile.bio || '';
    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('profiles')
          .select('bio')
          .eq('id', profile.id)
          .maybeSingle();
        if (data?.bio) remoteBio = data.bio;
      } catch {}
    }

    let sessions: DeviceSession[] = [];
    const match = remoteBio.match(/__devices:([A-Za-z0-9%_-]+)/);
    if (match) {
      try {
        sessions = JSON.parse(decodeURIComponent(match[1]));
      } catch {}
    }

    // Ensure current device is present and marked as current
    const currentIdx = sessions.findIndex((s) => s.deviceId === current.deviceId);
    const thisSession: DeviceSession = {
      deviceId: current.deviceId,
      name: current.name,
      platform: current.platform,
      browserOrApp: current.browserOrApp,
      os: current.os,
      loginTime: currentLoginTime,
      lastActiveTime: Date.now(),
      isCurrent: true,
    };

    if (currentIdx >= 0) {
      sessions[currentIdx] = thisSession;
    } else {
      sessions.unshift(thisSession);
    }

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.deviceId === current.deviceId,
    }));
  }

  /**
   * Revokes / logs out a secondary device
   */
  public static async revokeDevice(profile: UserProfile, targetDeviceId: string): Promise<DeviceSession[]> {
    let devices = await this.getActiveDevices(profile);
    devices = devices.filter((d) => d.deviceId !== targetDeviceId);

    const encoded = encodeURIComponent(JSON.stringify(devices));
    let baseBio = profile.bio || 'Available on Shongjog direct network';
    baseBio = baseBio.replace(/\s*__devices:[A-Za-z0-9%_-]+/g, '').trim();
    const newBio = `${baseBio} __devices:${encoded}`;

    profile.bio = newBio;
    profile.updatedAt = Date.now();

    try {
      const db = await getDatabase();
      await db.put('profiles', profile);
    } catch {}

    const { isConfigured } = getSupabaseConfig();
    if (navigator.onLine && isConfigured) {
      try {
        const supabase = getSupabase();
        await supabase
          .from('profiles')
          .update({
            bio: newBio,
            updated_at: new Date().toISOString(),
          })
          .eq('id', profile.id);
      } catch {}
    }

    return devices;
  }
}

