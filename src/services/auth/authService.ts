import { getSupabase, getSupabaseConfig } from '../supabase/supabaseClient';
import { IdentityService } from '../identity/identityService';
import { getDatabase } from '../db/database';
import type { UserProfile } from '../db/database';
import { FirebaseAuthService } from './firebaseAuthService';
import { TextbeeService } from './textbeeService';

export interface OtpSession {
  phoneNumber: string;
  formattedNumber: string;
  operator: string;
  code: string;
  expiresAt: number;
  attempts: number;
  provider?: 'textbee' | 'firebase' | 'supabase' | 'simulated';
}

const OTP_SESSION_KEY = 'shongjog_otp_session';

export class AuthService {
  /**
   * Dispatches an OTP verification code online to a Bangladeshi mobile number.
   * Priority:
   * 1. TextBee (100% Free real SMS via Android phone SIM, zero credit card)
   * 2. Firebase Phone Auth (If configured with Blaze)
   * 3. Supabase Auth SMS
   * 4. Instant Dev Testing Code
   */
  public static async sendOtp(phoneInput: string): Promise<{
    success: boolean;
    formattedPhone: string;
    operator: string;
    devOtp: string;
    isRealSms?: boolean;
    smsNotice?: string | null;
    provider?: 'textbee' | 'firebase' | 'supabase' | 'simulated';
  }> {
    if (!navigator.onLine) {
      throw new Error('Internet connection required for real-time OTP verification.');
    }

    const val = IdentityService.validateBangladeshPhone(phoneInput);
    if (!val.isValid) {
      throw new Error(val.error || 'Invalid phone number format.');
    }

    const formatted = val.formatted;
    const operator = val.operator || 'Bangladesh Mobile Network';

    // Cryptographically random 6-digit OTP
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const otpCode = (100000 + (array[0] % 900000)).toString();

    let isRealSms = false;
    let smsNotice: string | null = null;
    let activeProvider: 'textbee' | 'firebase' | 'supabase' | 'simulated' = 'simulated';

    // 1. Try TextBee (100% Free Android SIM SMS Gateway - No credit card required)
    if (TextbeeService.isConfigured()) {
      try {
        const tbRes = await TextbeeService.sendOtp(formatted, otpCode);
        if (tbRes.success) {
          isRealSms = true;
          activeProvider = 'textbee';
          smsNotice = null;
        } else {
          smsNotice = tbRes.error || 'TextBee SMS delivery failed.';
          console.warn('[TextBee SMS Error]:', tbRes.error);
        }
      } catch (tbErr: any) {
        smsNotice = tbErr?.message || 'TextBee gateway unreachable';
        console.warn('[TextBee Gateway Error]:', tbErr);
      }
    }

    // 2. Fallback to Firebase Phone Auth if configured and TextBee not active
    if (!isRealSms) {
      const { isConfigured: isFirebaseReady } = FirebaseAuthService.getConfig();
      if (isFirebaseReady) {
        try {
          const fbRes = await FirebaseAuthService.sendSmsOtp(formatted);
          if (fbRes.success) {
            isRealSms = true;
            activeProvider = 'firebase';
            smsNotice = null;
          } else {
            console.warn('[Firebase SMS Notice]:', fbRes.error);
          }
        } catch (fbErr: any) {
          console.warn('[Firebase SMS Error]:', fbErr);
        }
      }
    }

    // 3. Fallback to Supabase SMS if configured
    if (!isRealSms) {
      const { isConfigured: isSupabaseConfigured } = getSupabaseConfig();
      if (isSupabaseConfigured) {
        try {
          const supabase = getSupabase();
          const { error } = await supabase.auth.signInWithOtp({
            phone: formatted,
          });
          if (!error) {
            isRealSms = true;
            activeProvider = 'supabase';
          }
        } catch {
          // ignore
        }
      }
    }

    if (!isRealSms && !smsNotice) {
      smsNotice = 'Add VITE_TEXTBEE_API_KEY in .env to dispatch real SMS automatically from your Android phone!';
    }

    // Store verified OTP session (valid for 5 minutes)
    const session: OtpSession = {
      phoneNumber: phoneInput,
      formattedNumber: formatted,
      operator,
      code: otpCode,
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      provider: activeProvider,
    };
    sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify(session));

    return {
      success: true,
      formattedPhone: formatted,
      operator,
      devOtp: otpCode,
      isRealSms,
      smsNotice,
      provider: activeProvider,
    };
  }

  /**
   * Verifies the 6-digit OTP code against the active session.
   */
  public static async verifyOtp(
    formattedPhone: string,
    inputOtp: string
  ): Promise<{
    verified: boolean;
    existingProfile?: UserProfile | null;
  }> {
    if (!navigator.onLine) {
      throw new Error('Internet connection required to verify OTP code.');
    }

    const sessionRaw = sessionStorage.getItem(OTP_SESSION_KEY);
    if (!sessionRaw) {
      throw new Error('No active verification session. Please request a new code.');
    }

    const session: OtpSession = JSON.parse(sessionRaw);

    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(OTP_SESSION_KEY);
      throw new Error('Verification code has expired. Please request a new code.');
    }

    session.attempts += 1;
    if (session.attempts > 5) {
      sessionStorage.removeItem(OTP_SESSION_KEY);
      throw new Error('Too many failed attempts. Please request a new verification code.');
    }
    sessionStorage.setItem(OTP_SESSION_KEY, JSON.stringify(session));

    let isVerified = false;

    // 1. If Firebase sent the SMS, verify with Firebase
    if (session.provider === 'firebase') {
      const fbVerify = await FirebaseAuthService.verifySmsOtp(inputOtp);
      if (fbVerify.verified) {
        isVerified = true;
      } else if (inputOtp.trim() !== session.code) {
        throw new Error(fbVerify.error || 'Incorrect verification code. Please check and try again.');
      }
    }

    // 2. Try Supabase auth verify if Supabase was the provider
    if (!isVerified && session.provider === 'supabase') {
      const { isConfigured } = getSupabaseConfig();
      if (isConfigured) {
        try {
          const supabase = getSupabase();
          const { error } = await supabase.auth.verifyOtp({
            phone: formattedPhone,
            token: inputOtp.trim(),
            type: 'sms',
          });
          if (!error) isVerified = true;
        } catch {
          // Fall back to session code check
        }
      }
    }

    // 3. Simulated code match or fallback
    if (!isVerified && inputOtp.trim() === session.code) {
      isVerified = true;
    }

    if (!isVerified) {
      throw new Error('Incorrect verification code. Please check and try again.');
    }

    // Success! Clear OTP session
    sessionStorage.removeItem(OTP_SESSION_KEY);

    // Check if this phone number already has a registered profile in Supabase
    let existingProfile: UserProfile | null = null;
    const { isConfigured } = getSupabaseConfig();
    if (isConfigured) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('phone_number', formattedPhone)
          .maybeSingle();

        if (data) {
          existingProfile = {
            id: data.id,
            phoneNumber: data.phone_number,
            username: data.username,
            displayName: data.display_name,
            avatarUrl: data.avatar_url,
            bio: data.bio || 'Available on Shongjog direct network',
            publicKey: data.public_key,
            deviceId: data.device_id,
            createdAt: new Date(data.created_at).getTime(),
            updatedAt: new Date(data.updated_at).getTime(),
          };

          // Save to local IndexedDB
          const db = await getDatabase();
          await db.put('profiles', existingProfile);
          localStorage.setItem('contact_app_active_user_id', existingProfile.id);
        }
      } catch (err) {
        console.warn('Could not query existing Supabase profile', err);
      }
    }

    return {
      verified: true,
      existingProfile,
    };
  }

  /**
   * Checks real-time username availability in Supabase profiles
   */
  public static async isUsernameAvailable(username: string): Promise<boolean> {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) return false;

    const { isConfigured } = getSupabaseConfig();
    if (!isConfigured || !navigator.onLine) return true;

    try {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', clean)
        .maybeSingle();

      return !data;
    } catch {
      return true;
    }
  }
}
