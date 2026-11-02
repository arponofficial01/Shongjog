import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';
import type { Auth, ConfirmationResult } from 'firebase/auth';

const FIREBASE_CONFIG_STORAGE_KEY = 'shongjog_firebase_config';

export interface FirebaseAuthConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export class FirebaseAuthService {
  private static app: FirebaseApp | null = null;
  private static auth: Auth | null = null;
  private static recaptchaVerifier: RecaptchaVerifier | null = null;
  private static confirmationResult: ConfirmationResult | null = null;

  /**
   * Retrieves Firebase configuration from environment variables or localStorage.
   */
  public static getConfig(): { config: FirebaseAuthConfig | null; isConfigured: boolean } {
    const local = localStorage.getItem(FIREBASE_CONFIG_STORAGE_KEY);
    let parsedLocal: FirebaseAuthConfig | null = null;
    if (local) {
      try {
        parsedLocal = JSON.parse(local);
      } catch (e) {
        console.warn('Failed to parse local Firebase config', e);
      }
    }

    const apiKey = parsedLocal?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || '';
    const authDomain = parsedLocal?.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '';
    const projectId = parsedLocal?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
    const storageBucket = parsedLocal?.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '';
    const messagingSenderId =
      parsedLocal?.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '';
    const appId = parsedLocal?.appId || import.meta.env.VITE_FIREBASE_APP_ID || '';

    const isConfigured = Boolean(
      apiKey &&
        authDomain &&
        projectId &&
        !apiKey.includes('placeholder') &&
        !projectId.includes('placeholder')
    );

    if (!isConfigured) {
      return { config: null, isConfigured: false };
    }

    return {
      config: {
        apiKey,
        authDomain,
        projectId,
        storageBucket,
        messagingSenderId,
        appId,
      },
      isConfigured: true,
    };
  }

  /**
   * Saves Firebase config manually (useful for quick testing in UI).
   */
  public static saveConfig(config: FirebaseAuthConfig): void {
    localStorage.setItem(FIREBASE_CONFIG_STORAGE_KEY, JSON.stringify(config));
    this.app = null;
    this.auth = null;
    this.clearRecaptcha();
  }

  /**
   * Clears saved Firebase config.
   */
  public static clearConfig(): void {
    localStorage.removeItem(FIREBASE_CONFIG_STORAGE_KEY);
    this.app = null;
    this.auth = null;
    this.clearRecaptcha();
  }

  /**
   * Initializes or returns existing Firebase Auth instance.
   */
  public static getAuthInstance(): Auth | null {
    const { config, isConfigured } = this.getConfig();
    if (!isConfigured || !config) return null;

    if (!this.app) {
      if (getApps().length > 0) {
        this.app = getApp();
      } else {
        this.app = initializeApp(config);
      }
    }

    if (!this.auth && this.app) {
      this.auth = getAuth(this.app);
      // Set language code to Bengali / English
      this.auth.useDeviceLanguage();
    }

    return this.auth;
  }

  /**
   * Creates or returns an invisible RecaptchaVerifier attached to the designated element.
   */
  public static setupRecaptcha(containerId = 'recaptcha-container'): RecaptchaVerifier {
    const auth = this.getAuthInstance();
    if (!auth) {
      throw new Error('Firebase Auth is not configured. Please check your credentials.');
    }

    // Ensure the container element exists in DOM
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      document.body.appendChild(container);
    }

    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch {
        // ignore clear errors
      }
      this.recaptchaVerifier = null;
    }

    this.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved automatically
      },
      'expired-callback': () => {
        console.warn('reCAPTCHA expired. User must retry.');
      },
    });

    return this.recaptchaVerifier;
  }

  /**
   * Dispatches real SMS OTP via Firebase to any phone number (+880...)
   */
  public static async sendSmsOtp(
    formattedPhone: string,
    containerId = 'recaptcha-container'
  ): Promise<{ success: boolean; error?: string }> {
    const auth = this.getAuthInstance();
    if (!auth) {
      return { success: false, error: 'Firebase is not configured in .env' };
    }

    try {
      const verifier = this.setupRecaptcha(containerId);
      this.confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      return { success: true };
    } catch (err: any) {
      console.error('Firebase signInWithPhoneNumber error:', err);
      this.clearRecaptcha();
      let message = err.message || 'Failed to dispatch SMS';

      if (err.code === 'auth/invalid-phone-number') {
        message = 'Invalid phone number format for international delivery.';
      } else if (err.code === 'auth/too-many-requests') {
        message = 'SMS limit reached or too many attempts. Please try again in a few minutes.';
      } else if (err.code === 'auth/quota-exceeded') {
        message = 'Monthly SMS quota exceeded on Firebase project.';
      } else if (err.code === 'auth/network-request-failed') {
        message = 'Network error contacting Firebase SMS gateway.';
      } else if (err.code === 'auth/captcha-check-failed') {
        message = 'reCAPTCHA verification failed. Please refresh and try again.';
      }

      return { success: false, error: message };
    }
  }

  /**
   * Verifies the 6-digit OTP code against the active Firebase confirmation result.
   */
  public static async verifySmsOtp(
    otpCode: string
  ): Promise<{ verified: boolean; phoneNumber?: string | null; error?: string }> {
    if (!this.confirmationResult) {
      return { verified: false, error: 'No active Firebase SMS verification session found.' };
    }

    try {
      const result = await this.confirmationResult.confirm(otpCode.trim());
      this.confirmationResult = null; // Reset after successful verification
      return {
        verified: true,
        phoneNumber: result.user?.phoneNumber || null,
      };
    } catch (err: any) {
      console.error('Firebase OTP confirm error:', err);
      let message = 'Incorrect SMS verification code.';
      if (err.code === 'auth/invalid-verification-code') {
        message = 'Incorrect 6-digit code. Please verify the code sent to your phone.';
      } else if (err.code === 'auth/code-expired') {
        message = 'Verification code has expired. Please request a new code.';
      }
      return { verified: false, error: message };
    }
  }

  /**
   * Cleans up recaptcha verifier
   */
  public static clearRecaptcha(): void {
    if (this.recaptchaVerifier) {
      try {
        this.recaptchaVerifier.clear();
      } catch {
        // ignore
      }
      this.recaptchaVerifier = null;
    }
    this.confirmationResult = null;
  }
}
