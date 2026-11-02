import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AtSign,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
  Camera,
  FileText,
  Lock,
  Sparkles,
  Eye,
  EyeOff,
  Mail,
  Smartphone,
} from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import { AuthService } from '../services/auth/authService';
import type { UserProfile } from '../services/db/database';
import { getDatabase } from '../services/db/database';
import { getSupabaseConfig, getSupabase } from '../services/supabase/supabaseClient';
import { BrandLogo } from './BrandLogo';
import { LoginCinematicIntro } from './LoginCinematicIntro';
import { RecoverySyncService } from '../services/sync/recoverySyncService';
import { AccountSyncService } from '../services/sync/accountSyncService';
import { DeviceSessionService } from '../services/auth/deviceSessionService';

interface ProfileSetupModalProps {
  onProfileCreated: (profile: UserProfile) => void;
}

type AuthStep = 'phone' | 'otp' | 'profile' | 'set_password' | 'two_factor' | 'email_login';

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onProfileCreated }) => {
  const [showIntroAnimation, setShowIntroAnimation] = useState<boolean>(true);
  const [step, setStep] = useState<AuthStep>('phone');

  // Direct Email Login State
  const [directEmailInput, setDirectEmailInput] = useState('');
  const [directEmailOtpSent, setDirectEmailOtpSent] = useState(false);
  const [directEmailOtpDigits, setDirectEmailOtpDigits] = useState(['', '', '', '', '', '']);
  const [directEmailOtpLoading, setDirectEmailOtpLoading] = useState(false);
  const [directEmailOtpTimer, setDirectEmailOtpTimer] = useState(0);
  const directEmailInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 1: Phone & Auto Account Detection
  const [phoneInput, setPhoneInput] = useState('');
  const [detectedOperator, setDetectedOperator] = useState<string | null>(null);
  const [formattedPhone, setFormattedPhone] = useState('');
  const [accountStatus, setAccountStatus] = useState<'idle' | 'checking' | 'existing' | 'new'>('idle');
  const [existingUser, setExistingUser] = useState<UserProfile | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'otp'>('password');
  const [pendingExistingUser, setPendingExistingUser] = useState<UserProfile | null>(null);
  const [setPasswordVal, setSetPasswordVal] = useState('');
  const [confirmPasswordVal, setConfirmPasswordVal] = useState('');
  const [showSetPasswordEye, setShowSetPasswordEye] = useState(false);

  // Step 2FA: Two-Factor Authentication
  const [pending2FAUser, setPending2FAUser] = useState<UserProfile | null>(null);
  const [twoFactorDigits, setTwoFactorDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [trustThisDevice, setTrustThisDevice] = useState<boolean>(true);
  const twoFactorInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 2: OTP
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [devOtpNotification, setDevOtpNotification] = useState<string | null>(null);
  const [isRealSms, setIsRealSms] = useState(false);
  const [smsNotice, setSmsNotice] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 3: Profile Setup (Name, Username, Password, Avatar, Description/Bio)
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [bio, setBio] = useState<string>('Available on Shongjog direct network');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Recovery Email Login States (Alternative to 2FA PIN / Authenticator)
  const [recoveryEmailMode, setRecoveryEmailMode] = useState(false);
  const [recoveryEmailInput, setRecoveryEmailInput] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpDigits, setEmailOtpDigits] = useState(['', '', '', '', '', '']);
  const [emailOtpLoading, setEmailOtpLoading] = useState(false);
  const [emailOtpNotice, setEmailOtpNotice] = useState('');
  const [recoveryEmailOtpTimer, setRecoveryEmailOtpTimer] = useState(0);
  const emailOtpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Timers for OTP resend countdowns
  useEffect(() => {
    if (directEmailOtpTimer > 0) {
      const t = setTimeout(() => setDirectEmailOtpTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [directEmailOtpTimer]);

  useEffect(() => {
    if (recoveryEmailOtpTimer > 0) {
      const t = setTimeout(() => setRecoveryEmailOtpTimer((prev) => prev - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [recoveryEmailOtpTimer]);

  // Prevent 2FA Bypass on Page Refresh: Restore pending state if page reloads during 2FA
  useEffect(() => {
    try {
      const pendingJson = sessionStorage.getItem('shongjog_pending_2fa');
      if (pendingJson) {
        const parsed = JSON.parse(pendingJson) as UserProfile;
        if (parsed && parsed.id) {
          (async () => {
            const status = await RecoverySyncService.getRecoveryPinStatus(parsed);
            if (!status.hasPin) {
              // 2FA has been removed from this account - complete login immediately
              sessionStorage.removeItem('shongjog_pending_2fa');
              IdentityService.activateSession(parsed.id);
              DeviceSessionService.registerSession(parsed).catch(console.warn);
              onProfileCreated(parsed);
              return;
            }
            setPending2FAUser(parsed);
            setFormattedPhone(parsed.phoneNumber || '');
            setStep('two_factor');
          })();
        }
      }
    } catch {}
  }, []);

  // Shared
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Real-time phone operator detection & Account Status Lookup
  useEffect(() => {
    if (phoneInput.trim().length >= 3) {
      const val = IdentityService.validateBangladeshPhone(phoneInput);
      if (val.isValid && val.operator) {
        setDetectedOperator(val.operator);
        setFormattedPhone(val.formatted);
        setError('');
        setAccountStatus('checking');

        // Check if account already exists in Supabase or IndexedDB
        IdentityService.checkAccountStatus(val.formatted).then((res) => {
          if (res.exists && res.profile) {
            setAccountStatus('existing');
            setExistingUser(res.profile);
            if (res.hasPassword) {
              setLoginMode('password');
            } else {
              setLoginMode('otp');
            }
          } else {
            setAccountStatus('new');
            setExistingUser(null);
            setLoginMode('otp');
          }
        });
      } else {
        setDetectedOperator(null);
        setAccountStatus('idle');
        setExistingUser(null);
      }
    } else {
      setDetectedOperator(null);
      setAccountStatus('idle');
      setExistingUser(null);
    }
  }, [phoneInput]);

  // Auto-detect Supabase session from magic link redirect or email auth token
  useEffect(() => {
    const supabase = getSupabase();
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
        const email = session.user.email?.toLowerCase();
        if (email) {
          try {
            const { data: prof } = await supabase
              .from('profiles')
              .select('*')
              .or(`email.eq.${email},bio.ilike.%__email:${email}%`)
              .maybeSingle();

            if (prof) {
              const matchedProfile: UserProfile = {
                id: prof.id,
                displayName: prof.display_name || 'Citizen',
                username: prof.username || '',
                phoneNumber: prof.phone_number || '',
                avatarUrl: prof.avatar_url,
                publicKey: prof.public_key,
                email: email,
                bio: prof.bio,
                createdAt: prof.created_at ? new Date(prof.created_at).getTime() : Date.now(),
                recoveryPinHash: prof.recovery_pin_hash || undefined,
                passwordHash: prof.password_hash || undefined,
                deviceId: prof.device_id || 'web_' + Math.random().toString(36).substring(2, 10),
                updatedAt: prof.updated_at ? new Date(prof.updated_at).getTime() : Date.now(),
              };
              const db = await getDatabase();
              await db.put('profiles', matchedProfile);
              IdentityService.activateSession(matchedProfile.id);
              DeviceSessionService.registerSession(matchedProfile).catch(console.warn);
              AccountSyncService.syncAllFromCloud(matchedProfile).catch(console.warn);
              onProfileCreated(matchedProfile);
            } else {
              setStep('profile');
            }
          } catch (e) {
            console.warn('Session auto-login error:', e);
          }
        }
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [onProfileCreated]);

  // Resend countdown timer
  useEffect(() => {
    let timer: any;
    if (step === 'otp' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            setCanResend(true);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  // Real-time username check debounce
  useEffect(() => {
    const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (clean.length < 3) {
      setUsernameStatus((prev) => (prev !== 'idle' ? 'idle' : prev));
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const available = await AuthService.isUsernameAvailable(clean);
        setUsernameStatus(available ? 'available' : 'taken');
      } catch {
        setUsernameStatus('available');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username]);

  // Avatar file upload handler
  const handleAvatarSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Profile picture must be under 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string);
      setError('');
    };
    reader.readAsDataURL(file);
  };

  // --- Two-Factor Authentication (2FA) & Trust This Device ---
  const handleSuccessfulLogin = async (user: UserProfile) => {
    // If device is already marked as trusted, bypass 2FA immediately
    const isTrusted = localStorage.getItem(`shongjog_trusted_device_${user.id}`) === 'true';
    if (isTrusted) {
      IdentityService.activateSession(user.id);
      DeviceSessionService.registerSession(user).catch(console.warn);
      onProfileCreated(user);
      return;
    }

    // Check if 2FA has been disabled or removed on this account in cloud/settings
    const pinStatus = await RecoverySyncService.getRecoveryPinStatus(user);
    if (!pinStatus.hasPin) {
      // No 2FA required on this account
      sessionStorage.removeItem('shongjog_pending_2fa');
      IdentityService.activateSession(user.id);
      DeviceSessionService.registerSession(user).catch(console.warn);
      onProfileCreated(user);
      return;
    }

    // Persist pending 2FA state so page refresh keeps user strictly on 2FA (NO BYPASS)
    sessionStorage.setItem('shongjog_pending_2fa', JSON.stringify(user));
    setPending2FAUser(user);
    setTwoFactorDigits(['', '', '', '', '', '']);
    setTrustThisDevice(true);
    setError('');
    setRecoveryEmailMode(false);
    setEmailOtpSent(false);
    if (user.email) setRecoveryEmailInput(user.email);
    setStep('two_factor');
    setTimeout(() => twoFactorInputRefs.current[0]?.focus(), 150);
  };

  const handleTwoFactorChange = (index: number, value: string) => {
    setError('');
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const next = [...twoFactorDigits];
      next[index] = '';
      setTwoFactorDigits(next);
      return;
    }

    if (clean.length === 1) {
      const next = [...twoFactorDigits];
      next[index] = clean;
      setTwoFactorDigits(next);
      if (index < 5) {
        twoFactorInputRefs.current[index + 1]?.focus();
      } else {
        const full = next.join('');
        if (full.length === 6) {
          triggerVerify2FA(full);
        }
      }
    } else {
      const chars = clean.slice(0, 6).split('');
      const next = [...twoFactorDigits];
      chars.forEach((c, i) => {
        if (i < 6) next[i] = c;
      });
      setTwoFactorDigits(next);
      const focusIndex = Math.min(chars.length, 5);
      twoFactorInputRefs.current[focusIndex]?.focus();
      if (chars.length === 6) {
        triggerVerify2FA(chars.join(''));
      }
    }
  };

  const triggerVerify2FA = async (codeToVerify?: string) => {
    if (!pending2FAUser) return;
    const fullPin = codeToVerify || twoFactorDigits.join('');
    if (fullPin.length !== 6) {
      setError('Please enter all 6 digits of your Two-Factor Security PIN.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const status = await RecoverySyncService.getRecoveryPinStatus(pending2FAUser);
      if (status.hasPin) {
        const isValid = await RecoverySyncService.verifyPin(pending2FAUser, fullPin);
        if (!isValid) {
          setError('Incorrect 6-digit Authenticator code or Security PIN. Please try again.');
          setTwoFactorDigits(['', '', '', '', '', '']);
          setTimeout(() => twoFactorInputRefs.current[0]?.focus(), 60);
          setIsLoading(false);
          return;
        }
      } else {
        await RecoverySyncService.setRecoveryPin(pending2FAUser, fullPin);
      }

      // Sync all settings, chat lock PIN, and cloud profile to this device immediately
      AccountSyncService.syncAllFromCloud(pending2FAUser).catch((err: any) => {
        console.warn('Background sync on 2FA login notice:', err);
      });

      if (trustThisDevice) {
        localStorage.setItem(`shongjog_trusted_device_${pending2FAUser.id}`, 'true');
      }

      // Activate session only AFTER 2FA passes (No refresh bypass)
      IdentityService.activateSession(pending2FAUser.id);
      DeviceSessionService.registerSession(pending2FAUser).catch(console.warn);
      sessionStorage.removeItem('shongjog_pending_2fa');

      onProfileCreated(pending2FAUser);
    } catch (err: any) {
      setError(err.message || 'Two-Factor verification failed.');
      setTwoFactorDigits(['', '', '', '', '', '']);
      setTimeout(() => twoFactorInputRefs.current[0]?.focus(), 60);
    } finally {
      setIsLoading(false);
    }
  };

  // Direct Email OTP dispatch via Supabase Email
  const handleSendDirectEmailOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = directEmailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError('');
    setDirectEmailOtpLoading(true);
    try {
      const supabase = getSupabase();
      const { error: sendErr } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
      });
      if (sendErr) {
        throw new Error(sendErr.message || 'Failed to dispatch verification email via Supabase.');
      }
      setDirectEmailOtpSent(true);
      setDirectEmailOtpTimer(60);
      setDirectEmailOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => directEmailInputRefs.current[0]?.focus(), 120);
    } catch (err: any) {
      setError(err.message || 'Could not send verification email. Please check your connection.');
    } finally {
      setDirectEmailOtpLoading(false);
    }
  };

  // Direct Email OTP verification & Sovereign Account Resolution
  const handleVerifyDirectEmailOtp = async (codeToVerify?: string) => {
    const code = codeToVerify || directEmailOtpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setError('');
    setDirectEmailOtpLoading(true);
    try {
      const cleanEmail = directEmailInput.trim().toLowerCase();
      const supabase = getSupabase();
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: code,
        type: 'email',
      });
      if (vErr) {
        throw new Error('Incorrect email verification code. Please check your inbox or spam folder.');
      }

      // Check if a profile exists on Supabase with this email (or bio)
      let matchedProfile: UserProfile | null = null;
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .or(`email.eq.${cleanEmail},bio.ilike.%__email:${cleanEmail}%`)
          .maybeSingle();

        if (prof) {
          matchedProfile = {
            id: prof.id,
            displayName: prof.display_name || 'Citizen',
            username: prof.username || '',
            phoneNumber: prof.phone_number || '',
            avatarUrl: prof.avatar_url,
            publicKey: prof.public_key,
            email: cleanEmail,
            bio: prof.bio,
            createdAt: prof.created_at ? new Date(prof.created_at).getTime() : Date.now(),
            recoveryPinHash: prof.recovery_pin_hash || undefined,
            passwordHash: prof.password_hash || undefined,
            deviceId: prof.device_id || 'web_' + Math.random().toString(36).substring(2, 10),
            updatedAt: prof.updated_at ? new Date(prof.updated_at).getTime() : Date.now(),
          };
        }
      } catch (err) {
        console.warn('Could not query profile by email:', err);
      }

      if (matchedProfile) {
        const db = await getDatabase();
        await db.put('profiles', matchedProfile);
        IdentityService.activateSession(matchedProfile.id);
        DeviceSessionService.registerSession(matchedProfile).catch(console.warn);
        AccountSyncService.syncAllFromCloud(matchedProfile).catch(console.warn);
        onProfileCreated(matchedProfile);
      } else {
        // If new account via email, transition to profile setup with email stored
        setStep('profile');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setDirectEmailOtpLoading(false);
    }
  };

  // Recovery Email OTP dispatch via Supabase Email
  const handleSendRecoveryEmailCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!recoveryEmailInput.trim() || !recoveryEmailInput.includes('@')) {
      setError('Please enter a valid recovery email address.');
      return;
    }
    setError('');
    setEmailOtpLoading(true);
    try {
      const supabase = getSupabase();
      const { error: sendErr } = await supabase.auth.signInWithOtp({
        email: recoveryEmailInput.trim(),
      });
      if (sendErr) {
        throw new Error(sendErr.message || 'Failed to dispatch verification email.');
      }
      setEmailOtpSent(true);
      setRecoveryEmailOtpTimer(60);
      setEmailOtpNotice(`6-digit verification code sent to ${recoveryEmailInput.trim()} via Supabase.`);
      setEmailOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => emailOtpInputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Could not send verification email. Please check your address or try PIN.');
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // Recovery Email OTP verification
  const handleVerifyRecoveryEmailCode = async (codeToVerify?: string) => {
    const code = codeToVerify || emailOtpDigits.join('');
    if (code.length !== 6) {
      setError('Please enter the 6-digit code sent to your email.');
      return;
    }
    setError('');
    setEmailOtpLoading(true);
    try {
      const supabase = getSupabase();
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: recoveryEmailInput.trim(),
        token: code,
        type: 'email',
      });
      if (vErr) {
        throw new Error('Incorrect email verification code. Please check your inbox or spam folder.');
      }

      if (pending2FAUser) {
        pending2FAUser.email = recoveryEmailInput.trim();
        const db = await getDatabase();
        await db.put('profiles', pending2FAUser);

        IdentityService.activateSession(pending2FAUser.id);
        DeviceSessionService.registerSession(pending2FAUser).catch(console.warn);
        AccountSyncService.syncAllFromCloud(pending2FAUser).catch(console.warn);

        if (trustThisDevice) {
          localStorage.setItem(`shongjog_trusted_device_${pending2FAUser.id}`, 'true');
        }
        sessionStorage.removeItem('shongjog_pending_2fa');
        onProfileCreated(pending2FAUser);
      }
    } catch (err: any) {
      setError(err.message || 'Email verification failed. Please try again.');
    } finally {
      setEmailOtpLoading(false);
    }
  };

  // --- Password Sign In (ZERO SMS QUOTA USED) ---
  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput.trim()) {
      setError('Please enter your account password.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const user = await IdentityService.loginWithPassword(formattedPhone, passwordInput);
      await handleSuccessfulLogin(user);
    } catch (err: any) {
      setError(err.message || 'Incorrect password.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 1: Send OTP (First-time or fallback) ---
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');

    if (!navigator.onLine) {
      setError('Active internet connection required for real-time mobile verification.');
      return;
    }

    const val = IdentityService.validateBangladeshPhone(phoneInput);
    if (!val.isValid) {
      setError(val.error || 'Please enter a valid Bangladeshi mobile number (e.g. 01712345678).');
      return;
    }

    setIsLoading(true);
    try {
      const res = await AuthService.sendOtp(phoneInput);
      setFormattedPhone(res.formattedPhone);
      setDevOtpNotification(res.devOtp);
      setIsRealSms(!!res.isRealSms);
      setSmsNotice(res.smsNotice || null);
      setStep('otp');
      setCountdown(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.message || 'Failed to dispatch verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 2: OTP Input & Verification ---
  const handleOtpChange = (index: number, value: string) => {
    const char = value.slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = char;
    setOtpDigits(newDigits);

    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto verify if all 6 digits entered
    if (newDigits.every((d) => d.length === 1)) {
      triggerVerifyOtp(newDigits.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '');
    if (pasted.length >= 6) {
      const digits = pasted.slice(0, 6).split('');
      setOtpDigits(digits);
      otpInputRefs.current[5]?.focus();
      triggerVerifyOtp(pasted.slice(0, 6));
    }
  };

  const triggerVerifyOtp = async (codeToVerify?: string) => {
    const fullCode = codeToVerify || otpDigits.join('');
    if (fullCode.length !== 6) {
      setError('Please enter the complete 6-digit code.');
      return;
    }

    setError('');
    setIsLoading(true);
    try {
      const res = await AuthService.verifyOtp(formattedPhone, fullCode);
      if (res.verified) {
        if (res.existingProfile) {
          // Returning user: automatically restored and signed in!
          if (!res.existingProfile.passwordHash) {
            setPendingExistingUser(res.existingProfile);
            setStep('set_password');
          } else {
            await handleSuccessfulLogin(res.existingProfile);
          }
        } else {
          // New citizen: proceed to name, avatar, username, password, and description step
          setStep('profile');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await AuthService.sendOtp(formattedPhone);
      setDevOtpNotification(res.devOtp);
      setCountdown(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 4: Save Password for returning user who didn't set password ---
  const handleSaveExistingUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!pendingExistingUser) return;

    if (!setPasswordVal || setPasswordVal.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (setPasswordVal !== confirmPasswordVal) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);
    try {
      const passwordHash = await IdentityService.hashPassword(setPasswordVal.trim());
      const updatedProfile: UserProfile = {
        ...pendingExistingUser,
        passwordHash,
        updatedAt: Date.now(),
      };

      const db = await getDatabase();
      await db.put('profiles', updatedProfile);

      const { isConfigured } = getSupabaseConfig();
      if (navigator.onLine && isConfigured) {
        try {
          const supabase = getSupabase();
          await supabase.from('profiles').upsert({
            id: updatedProfile.id,
            username: updatedProfile.username,
            display_name: updatedProfile.displayName,
            avatar_url: updatedProfile.avatarUrl,
            phone_number: updatedProfile.phoneNumber,
            password_hash: passwordHash,
            public_key: updatedProfile.publicKey,
            device_id: updatedProfile.deviceId,
            updated_at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('Could not sync password to Supabase', err);
        }
      }

      await handleSuccessfulLogin(updatedProfile);
    } catch (err: any) {
      setError(err.message || 'Failed to set password.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 3: Complete Profile & Sync to Supabase ---
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!displayName.trim()) {
      setError('Please enter your full name');
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (usernameStatus === 'taken') {
      setError('This username is already taken. Please choose another one.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Please create a password of at least 6 characters for fast future logins.');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await IdentityService.setupProfile(
        formattedPhone,
        cleanUsername,
        displayName.trim(),
        avatarUrl || undefined,
        bio.trim() || undefined,
        newPassword
      );
      onProfileCreated(profile);
    } catch (err: any) {
      setError(err.message || 'Failed to complete profile synchronization');
    } finally {
      setIsLoading(false);
    }
  };

  if (showIntroAnimation) {
    return <LoginCinematicIntro onComplete={() => setShowIntroAnimation(false)} />;
  }

  return (
    <div className="cinema-login-stage">
      {/* Video-Style Dynamic Ambient Background */}
      <div className="cinema-backdrop-canvas" aria-hidden="true">
        <div className="cinema-ambient-orb cinema-orb-1" />
        <div className="cinema-ambient-orb cinema-orb-2" />
        <div className="cinema-ambient-orb cinema-orb-3" />
        <div className="cinema-mesh-grid" />
      </div>

      <div className="cinema-card-shell">
        {/* Header Icon with Pulsing Halo */}
        <div className="cinema-logo-beacon">
          <div className="cinema-logo-beacon-inner">
            <BrandLogo size={58} />
          </div>
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '25px',
            fontWeight: 700,
            color: 'var(--text-pure)',
            letterSpacing: '-0.5px',
            margin: '0 0 4px 0',
          }}
        >
          Shongjog <span style={{ fontFamily: 'var(--font-bangla)', color: 'var(--accent-light)', fontSize: '20px' }}>{'\u09B8\u0982\u09AF\u09CB\u0997'}</span>
        </h1>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
          {step === 'phone' && (
            accountStatus === 'existing' && loginMode === 'password'
              ? `Welcome back, ${existingUser?.displayName || 'Citizen'}! Sign in with your password.`
              : 'Enter your Bangladeshi mobile number to continue.'
          )}
          {step === 'otp' && `Enter the 6-digit verification code sent to ${formattedPhone}`}
          {step === 'profile' && 'Create your citizen profile picture, username, and account password.'}
          {step === 'two_factor' && 'Two-Factor Authentication required for this device.'}
          {step === 'email_login' && (
            directEmailOtpSent
              ? `Enter the 6-digit verification code sent to ${directEmailInput}`
              : 'Sign in to your sovereign account using your registered email.'
          )}
        </p>

        {/* Global Error Banner */}
        {error && step !== 'two_factor' && (
          <div
            style={{
              padding: '11px 14px',
              backgroundColor: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: '10px',
              color: '#fda4af',
              fontSize: '13px',
              marginBottom: 16,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* =========================================================================
            STEP 1: PHONE NUMBER INPUT + AUTO-DETECT (PASSWORD / OTP)
            ========================================================================= */}
        {step === 'phone' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--accent-light)', letterSpacing: '0.4px' }}>
                  BANGLADESH MOBILE NUMBER
                </label>
                {detectedOperator && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--accent-light)',
                      background: 'rgba(16, 185, 129, 0.15)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    ✓ {detectedOperator}
                  </span>
                )}
              </div>

              {/* Integrated Phone Input Box */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1.5px solid var(--border-glass)',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 14px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRight: '1px solid var(--border-glass)',
                    color: 'var(--accent-light)',
                    fontWeight: 700,
                    fontSize: '14px',
                    userSelect: 'none',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: '16px' }}>🇧🇩</span>
                  <span>+880</span>
                </div>

                <input
                  type="tel"
                  placeholder="1712 345678"
                  value={phoneInput}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, '');
                    setPhoneInput(digits.replace(/^0+/, ''));
                  }}
                  maxLength={11}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: '12px 14px',
                    fontSize: '15px',
                    color: 'var(--text-pure)',
                    letterSpacing: '0.5px',
                    minWidth: 0,
                  }}
                  required
                  autoFocus
                />
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 5 }}>
                Enter without leading 0. Supports GP (17/13), Robi (18), Banglalink (19/14), Airtel (16), Teletalk (15).
              </div>
            </div>

            {/* Account Detection Status Badge */}
            {accountStatus === 'existing' && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <CheckCircle2 size={16} color="var(--accent-light)" />
                  <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--accent-light)' }}>
                    Existing Account: {existingUser?.displayName || 'Citizen'}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '10.5px',
                    color: 'var(--text-primary)',
                    background: 'rgba(255, 255, 255, 0.08)',
                    padding: '2px 7px',
                    borderRadius: '4px',
                  }}
                >
                  ⚡ Instant Sign In
                </span>
              </div>
            )}

            {accountStatus === 'new' && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Sparkles size={15} color="#60a5fa" />
                <span style={{ fontSize: '12.5px', color: '#93c5fd', fontWeight: 600 }}>
                  New Account Registration (First-time verification)
                </span>
              </div>
            )}

            {/* Mode A: Existing Account Password Sign In */}
            {accountStatus === 'existing' && loginMode === 'password' ? (
              <form onSubmit={handlePasswordSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 5 }}>
                    ACCOUNT PASSWORD
                  </label>
                  <div className="input-prefix-wrapper">
                    <span className="input-prefix-symbol">
                      <Lock size={16} />
                    </span>
                    <input
                      type="password"
                      placeholder="Enter your account password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="lux-form-input has-prefix"
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="primary-action-btn-lux"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>{isLoading ? 'Verifying Password...' : 'Sign In with Password'}</span>
                  <ArrowRight size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    marginTop: 2,
                    textDecoration: 'underline',
                  }}
                >
                  Forgot password? Log in with SMS OTP instead
                </button>
              </form>
            ) : (
              /* Mode B: Send SMS OTP (New users or Forgot Password) */
              <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="primary-action-btn-lux"
                  style={{
                    marginTop: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>{isLoading ? 'Verifying Network...' : 'Send Verification Code'}</span>
                  <ArrowRight size={18} />
                </button>

                {accountStatus === 'existing' && (
                  <button
                    type="button"
                    onClick={() => setLoginMode('password')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-light)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'center',
                    }}
                  >
                  ← Sign in with password instead
                  </button>
                )}
              </form>
            )}

            {/* Direct Email Login Alternative Trigger */}
            <div style={{ textAlign: 'center', marginTop: 8, paddingTop: 10, borderTop: '1px solid var(--border-glass, rgba(148, 163, 184, 0.15))' }}>
              <button
                type="button"
                onClick={() => {
                  setStep('email_login');
                  setError('');
                  setDirectEmailOtpSent(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-light, #10b981)',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Mail size={14} />
                <span>Or sign in with Email Verification Code</span>
              </button>
            </div>
          </div>
        )}

        {/* =========================================================================
            DIRECT EMAIL LOGIN: REAL SUPABASE OTP VIA EMAIL
            ========================================================================= */}
        {step === 'email_login' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <div style={{ textAlign: 'center', marginBottom: 2 }}>
              <div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-pure)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Mail size={20} color="#10b981" />
                <span>Email Authentication</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                {directEmailOtpSent
                  ? `Enter the 6-digit code dispatched to ${directEmailInput}`
                  : 'Receive a real-time cryptographic verification token directly to your inbox.'}
              </p>
            </div>

            {!directEmailOtpSent ? (
              <form onSubmit={handleSendDirectEmailOtp} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-light, #10b981)', display: 'block', marginBottom: 6, letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    Email Address
                  </label>
                  <div className="input-prefix-wrapper" style={{ position: 'relative' }}>
                    <span className="input-prefix-symbol" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#10b981', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
                      <Mail size={16} />
                    </span>
                    <input
                      type="email"
                      value={directEmailInput}
                      onChange={(e) => {
                        setDirectEmailInput(e.target.value);
                        setError('');
                      }}
                      placeholder="e.g. arponofficial01@gmail.com"
                      className="lux-form-input has-prefix"
                      style={{ paddingLeft: '44px' }}
                      required
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={directEmailOtpLoading || !directEmailInput.trim() || !directEmailInput.includes('@')}
                  className="primary-action-btn-lux"
                  style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <span>{directEmailOtpLoading ? 'Dispatching Email Code...' : 'Send Verification Code'}</span>
                  <ArrowRight size={17} />
                </button>

                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setError('');
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', padding: 4 }}
                  >
                    ← Back to Phone Number Sign In
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.28)', borderRadius: 12, padding: '10px 14px', fontSize: '12.5px', color: '#6ee7b7', textAlign: 'center' }}>
                  6-digit verification code sent to <strong>{directEmailInput}</strong> via Supabase
                </div>

                <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                  {directEmailOtpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        directEmailInputRefs.current[i] = el;
                      }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      disabled={directEmailOtpLoading}
                      onChange={(e) => {
                        setError('');
                        const val = e.target.value.replace(/\D/g, '').slice(-1);
                        const next = [...directEmailOtpDigits];
                        next[i] = val;
                        setDirectEmailOtpDigits(next);
                        if (val && i < 5) {
                          directEmailInputRefs.current[i + 1]?.focus();
                        }
                        if (next.every((d) => d.length === 1)) {
                          handleVerifyDirectEmailOtp(next.join(''));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !directEmailOtpDigits[i] && i > 0) {
                          directEmailInputRefs.current[i - 1]?.focus();
                        }
                      }}
                      style={{
                        width: '46px',
                        height: '52px',
                        borderRadius: '12px',
                        backgroundColor: digit ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-input, rgba(148, 163, 184, 0.08))',
                        border: digit ? '2px solid #10b981' : '1px solid var(--border-color, rgba(148, 163, 184, 0.28))',
                        color: 'var(--text-pure)',
                        fontSize: '22px',
                        fontWeight: 700,
                        textAlign: 'center',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  disabled={directEmailOtpLoading || directEmailOtpDigits.some((d) => !d)}
                  onClick={() => handleVerifyDirectEmailOtp()}
                  className="primary-action-btn-lux"
                  style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <span>{directEmailOtpLoading ? 'Verifying Code...' : 'Verify Code & Sign In'}</span>
                  <CheckCircle2 size={17} />
                </button>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: '12px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setDirectEmailOtpSent(false);
                      setError('');
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
                  >
                    ← Change Email
                  </button>

                  <button
                    type="button"
                    onClick={handleSendDirectEmailOtp}
                    disabled={directEmailOtpLoading || directEmailOtpTimer > 0}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: directEmailOtpTimer > 0 ? 'var(--text-secondary)' : '#10b981',
                      fontWeight: 600,
                      cursor: directEmailOtpTimer > 0 ? 'default' : 'pointer',
                      padding: 2,
                    }}
                  >
                    {directEmailOtpTimer > 0 ? `Resend in ${directEmailOtpTimer}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =========================================================================
            STEP 2: 6-DIGIT REALTIME OTP VERIFICATION
            ========================================================================= */}
        {step === 'otp' && (
          <div style={{ textAlign: 'center' }}>
            {isRealSms ? (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: 18,
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                }}
              >
                <Smartphone size={22} color="var(--accent-light, #10b981)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--accent-light)' }}>
                    Real SMS Sent to {formattedPhone}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11.5px', marginTop: 2 }}>
                    Please check your mobile text messages for the 6-digit verification code.
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: 'rgba(234, 179, 8, 0.08)',
                  border: '1px solid rgba(234, 179, 8, 0.25)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: 18,
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#fde047' }}>
                    Free OTP Verification Mode
                  </span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    Code: <strong style={{ color: 'var(--accent-light)', fontFamily: 'monospace', fontSize: '14px', letterSpacing: '1px' }}>{devOtpNotification}</strong>
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.4 }}>
                  {smsNotice || 'Enter the 6-digit confirmation code displayed above to complete citizen verification.'}
                </div>
              </div>
            )}

            {/* 6-Digit Individual Boxes */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
                marginBottom: 20,
              }}
              onPaste={handleOtpPaste}
            >
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    otpInputRefs.current[idx] = el;
                  }}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  style={{
                    width: '46px',
                    height: '54px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: digit ? '1.5px solid var(--accent-light)' : '1px solid var(--border-glass)',
                    textAlign: 'center',
                    fontSize: '22px',
                    fontWeight: 700,
                    color: 'var(--text-pure)',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              disabled={isLoading || otpDigits.some((d) => !d)}
              onClick={() => triggerVerifyOtp()}
              className="primary-action-btn-lux"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <span>{isLoading ? 'Verifying Code...' : 'Verify & Continue'}</span>
              <CheckCircle2 size={18} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setError('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <ArrowLeft size={14} />
                <span>Change Number</span>
              </button>

              <button
                type="button"
                disabled={!canResend || isLoading}
                onClick={handleResendOtp}
                style={{
                  background: 'none',
                  border: 'none',
                  color: canResend ? 'var(--accent-light)' : '#64748b',
                  cursor: canResend ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontWeight: 600,
                }}
              >
                <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                <span>{canResend ? 'Resend Code' : `Resend in ${countdown}s`}</span>
              </button>
            </div>
          </div>
        )}

        {/* Firebase Phone Auth invisible reCAPTCHA DOM target */}
        <div id="recaptcha-container" style={{ display: 'none' }}></div>

        {/* =========================================================================
            STEP 3: PROFILE IDENTITY & PASSWORD (SAVED FOR ZERO-QUOTA FUTURE LOGINS)
            ========================================================================= */}
        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
            {/* Profile Picture Upload & Preview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 4 }}>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleAvatarSelected}
              />
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '16px',
                  background: 'var(--brand-orb-grad)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '26px',
                  color: 'white',
                  fontWeight: 700,
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: '0 4px 18px var(--accent-glow)',
                  border: '1.5px solid var(--border-glass-bright)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onClick={() => fileInputRef.current?.click()}
                title="Upload Profile Picture"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  displayName.charAt(0).toUpperCase() || <Camera size={24} />
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    color: 'var(--text-pure)',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Choose Photo
                </button>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                  JPG, PNG or WEBP under 2MB
                </div>
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 5, letterSpacing: '0.4px' }}>
                FULL CITIZEN NAME
              </label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  placeholder="e.g. Tanvir Ahmed"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="lux-form-input has-prefix"
                  required
                  autoFocus
                />
              </div>
            </div>

            {/* Username (@Handle) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', letterSpacing: '0.4px' }}>
                  UNIQUE USERNAME (@HANDLE)
                </label>
                {usernameStatus === 'checking' && (
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Checking...</span>
                )}
                {usernameStatus === 'available' && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-light)', fontWeight: 600 }}>✓ Available</span>
                )}
                {usernameStatus === 'taken' && (
                  <span style={{ fontSize: '11px', color: 'var(--rose-danger)', fontWeight: 600 }}>✕ Already Taken</span>
                )}
              </div>

              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <AtSign size={16} />
                </span>
                <input
                  type="text"
                  placeholder="tanvir_bd"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="lux-form-input has-prefix"
                  required
                />
              </div>
            </div>

            {/* Create Password */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 5, letterSpacing: '0.4px' }}>
                CREATE ACCOUNT PASSWORD
              </label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <Lock size={16} />
                </span>
                <input
                  type="password"
                  placeholder="Set a password (min 6 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="lux-form-input has-prefix"
                  required
                />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                Allows you to log in securely anytime with your password and two-factor protection.
              </div>
            </div>

            {/* Description / Bio */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 5, letterSpacing: '0.4px' }}>
                PROFILE DESCRIPTION / ABOUT
              </label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <FileText size={16} />
                </span>
                <input
                  type="text"
                  placeholder="e.g. Available on Shongjog direct network"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="lux-form-input has-prefix"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || usernameStatus === 'taken'}
              className="primary-action-btn-lux"
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span>{isLoading ? 'Setting up profile...' : 'Complete Profile & Launch'}</span>
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        {/* =========================================================================
            STEP 4: MANDATORY PASSWORD SETUP FOR RESTORED / RETURNING CITIZENS
            ========================================================================= */}
        {step === 'set_password' && pendingExistingUser && (
          <form onSubmit={handleSaveExistingUserPassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              className="cinema-welcome-card"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1.5px solid rgba(16, 185, 129, 0.35)',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '18px',
                  flexShrink: 0,
                }}
              >
                {pendingExistingUser.avatarUrl ? (
                  <img src={pendingExistingUser.avatarUrl} alt={pendingExistingUser.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  pendingExistingUser.displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-pure, #0f172a)' }}>
                  Welcome back, <span style={{ color: '#10b981' }}>{pendingExistingUser.displayName}</span>!
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)', fontWeight: 600, marginTop: 2 }}>
                  @{pendingExistingUser.username} • {pendingExistingUser.phoneNumber}
                </div>
              </div>
            </div>

            <div
              style={{
                background: 'rgba(245, 158, 11, 0.14)',
                border: '1.5px solid rgba(245, 158, 11, 0.45)',
                borderRadius: '12px',
                padding: '11px 14px',
                fontSize: '12.5px',
                lineHeight: 1.45,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: '16px', lineHeight: 1, flexShrink: 0 }}>🛡️</span>
              <div>
                <strong style={{ color: '#d97706', fontWeight: 700 }}>Password Required:</strong>{' '}
                <span style={{ color: '#b45309', fontWeight: 600 }}>
                  You don&apos;t have a password set yet. Please set your account password now for secure instant access.
                </span>
              </div>
            </div>

            {/* Password input */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-light, #10b981)', display: 'block', marginBottom: 6, letterSpacing: '0.4px', textAlign: 'left', textTransform: 'uppercase' }}>
                New Account Password (min 6 characters)
              </label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <Lock size={16} />
                </span>
                <input
                  type={showSetPasswordEye ? 'text' : 'password'}
                  placeholder="Set your account password"
                  value={setPasswordVal}
                  onChange={(e) => setSetPasswordVal(e.target.value)}
                  className="lux-form-input has-prefix"
                  required
                  minLength={6}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowSetPasswordEye(!showSetPasswordEye)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 4, zIndex: 2 }}
                >
                  {showSetPasswordEye ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm Password input */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-light, #10b981)', display: 'block', marginBottom: 6, letterSpacing: '0.4px', textAlign: 'left', textTransform: 'uppercase' }}>
                Confirm Password
              </label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <Lock size={16} />
                </span>
                <input
                  type={showSetPasswordEye ? 'text' : 'password'}
                  placeholder="Confirm your password"
                  value={confirmPasswordVal}
                  onChange={(e) => setConfirmPasswordVal(e.target.value)}
                  className="lux-form-input has-prefix"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !setPasswordVal || !confirmPasswordVal}
              className="primary-action-btn-lux"
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <span>{isLoading ? 'Securing account...' : 'Set Password & Enter App'}</span>
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        {/* =========================================================================
            STEP 5: TWO-FACTOR AUTHENTICATION & TRUST THIS DEVICE
            ========================================================================= */}
        {step === 'two_factor' && pending2FAUser && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              triggerVerify2FA();
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
              }}
            >
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '18px',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                }}
              >
                {pending2FAUser.avatarUrl ? (
                  <img src={pending2FAUser.avatarUrl} alt={pending2FAUser.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  pending2FAUser.displayName.charAt(0).toUpperCase()
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-pure)' }}>
                  {pending2FAUser.displayName}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--accent-light, #10b981)', fontWeight: 600 }}>
                  @{pending2FAUser.username} • {pending2FAUser.phoneNumber}
                </div>
              </div>
            </div>

            {!recoveryEmailMode ? (
              <>
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-pure)', marginBottom: 4 }}>
                    Two-Factor Security Verification
                  </div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                    Enter your 6-digit Authenticator code (or Security PIN) to verify your login on this device.
                  </p>
                </div>

                {/* 6 Digit Input Boxes */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, margin: '8px 0' }}>
                  {twoFactorDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => {
                        twoFactorInputRefs.current[i] = el;
                      }}
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      disabled={isLoading}
                      onChange={(e) => handleTwoFactorChange(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !twoFactorDigits[i] && i > 0) {
                          twoFactorInputRefs.current[i - 1]?.focus();
                        }
                      }}
                      style={{
                        width: '46px',
                        height: '54px',
                        borderRadius: '12px',
                        backgroundColor: digit ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-input, rgba(148, 163, 184, 0.08))',
                        border: digit ? '2px solid var(--accent-main, #10b981)' : '1px solid var(--border-color, rgba(148, 163, 184, 0.28))',
                        color: 'var(--text-pure)',
                        fontSize: '24px',
                        fontWeight: 700,
                        textAlign: 'center',
                        outline: 'none',
                        transition: 'all 0.18s ease',
                        boxShadow: digit ? '0 0 12px rgba(16, 185, 129, 0.25)' : 'none',
                      }}
                    />
                  ))}
                </div>

                {/* Prominent High-Contrast Red Error Alert */}
                {error && (
                  <div
                    style={{
                      padding: '11px 16px',
                      backgroundColor: 'rgba(239, 68, 68, 0.12)',
                      border: '1.5px solid #ef4444',
                      borderRadius: '12px',
                      color: '#ef4444',
                      fontSize: '13px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      textAlign: 'center',
                      boxShadow: '0 2px 10px rgba(239, 68, 68, 0.15)',
                    }}
                  >
                    <AlertCircle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Trust this device checkbox */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    cursor: 'pointer',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    background: 'var(--bg-secondary, rgba(148, 163, 184, 0.06))',
                    border: '1px solid var(--border-color, rgba(148, 163, 184, 0.18))',
                    fontSize: '13px',
                    color: 'var(--text-pure)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={trustThisDevice}
                    onChange={(e) => setTrustThisDevice(e.target.checked)}
                    style={{
                      width: '18px',
                      height: '18px',
                      accentColor: '#10b981',
                      cursor: 'pointer',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-pure)' }}>Trust this device</div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      Skip two-factor verification on this device in the future
                    </div>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isLoading || twoFactorDigits.join('').length !== 6}
                  className="primary-action-btn-lux"
                  style={{
                    marginTop: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <span>{isLoading ? 'Verifying PIN...' : 'Verify & Continue'}</span>
                  <ArrowRight size={18} />
                </button>

                {/* Alternative: Recovery Email Login Option */}
                <div style={{ textAlign: 'center', marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryEmailMode(true);
                      setError('');
                      if (pending2FAUser.email) {
                        setRecoveryEmailInput(pending2FAUser.email);
                      }
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-light, #10b981)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Mail size={14} />
                    <span>Lost authenticator? Verify via Recovery Email</span>
                  </button>
                </div>
              </>
            ) : (
              /* Recovery Email Verification Mode */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ textAlign: 'center', marginTop: 2 }}>
                  <div style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-pure)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Mail size={18} color="#10b981" />
                    <span>Recovery Email Verification</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                    Receive a secure verification code directly to your email via Supabase.
                  </p>
                </div>

                {!emailOtpSent ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 5 }}>
                        RECOVERY EMAIL ADDRESS
                      </label>
                      <div className="input-prefix-wrapper">
                        <span className="input-prefix-symbol">
                          <Mail size={16} />
                        </span>
                        <input
                          type="email"
                          value={recoveryEmailInput}
                          onChange={(e) => {
                            setRecoveryEmailInput(e.target.value);
                            setError('');
                          }}
                          placeholder="e.g. yourname@gmail.com"
                          className="lux-form-input has-prefix"
                          required
                        />
                      </div>
                    </div>

                    {error && (
                      <div style={{ padding: '9px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1.5px solid #ef4444', borderRadius: '10px', color: '#ef4444', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertCircle size={15} color="#ef4444" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={emailOtpLoading || !recoveryEmailInput.trim() || !recoveryEmailInput.includes('@')}
                      onClick={handleSendRecoveryEmailCode}
                      className="primary-action-btn-lux"
                      style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>{emailOtpLoading ? 'Sending Email Code...' : 'Send Verification Code'}</span>
                      <ArrowRight size={17} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: '9px 12px', fontSize: '12px', color: '#6ee7b7', textAlign: 'center' }}>
                      {emailOtpNotice || `Verification code sent to ${recoveryEmailInput}`}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                      {emailOtpDigits.map((digit, i) => (
                        <input
                          key={i}
                          ref={(el) => {
                            emailOtpInputRefs.current[i] = el;
                          }}
                          type="password"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          disabled={emailOtpLoading}
                          onChange={(e) => {
                            setError('');
                            const val = e.target.value.replace(/\D/g, '').slice(-1);
                            const next = [...emailOtpDigits];
                            next[i] = val;
                            setEmailOtpDigits(next);
                            if (val && i < 5) {
                              emailOtpInputRefs.current[i + 1]?.focus();
                            }
                            if (next.every((d) => d.length === 1)) {
                              handleVerifyRecoveryEmailCode(next.join(''));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Backspace' && !emailOtpDigits[i] && i > 0) {
                              emailOtpInputRefs.current[i - 1]?.focus();
                            }
                          }}
                          style={{
                            width: '46px',
                            height: '52px',
                            borderRadius: '12px',
                            backgroundColor: digit ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-input, rgba(148, 163, 184, 0.08))',
                            border: digit ? '2px solid #10b981' : '1px solid var(--border-color, rgba(148, 163, 184, 0.28))',
                            color: 'var(--text-pure)',
                            fontSize: '22px',
                            fontWeight: 700,
                            textAlign: 'center',
                            outline: 'none',
                          }}
                        />
                      ))}
                    </div>

                    {error && (
                      <div style={{ padding: '9px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1.5px solid #ef4444', borderRadius: '10px', color: '#ef4444', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertCircle size={15} color="#ef4444" />
                        <span>{error}</span>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={emailOtpLoading || emailOtpDigits.some((d) => !d)}
                      onClick={() => handleVerifyRecoveryEmailCode()}
                      className="primary-action-btn-lux"
                      style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      <span>{emailOtpLoading ? 'Verifying...' : 'Verify Code & Sign In'}</span>
                      <CheckCircle2 size={17} />
                    </button>

                    <div style={{ textAlign: 'center', marginTop: 4 }}>
                      <button
                        type="button"
                        onClick={handleSendRecoveryEmailCode}
                        disabled={emailOtpLoading || recoveryEmailOtpTimer > 0}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: recoveryEmailOtpTimer > 0 ? 'var(--text-secondary)' : '#10b981',
                          fontWeight: 600,
                          fontSize: '12px',
                          cursor: recoveryEmailOtpTimer > 0 ? 'default' : 'pointer',
                        }}
                      >
                        {recoveryEmailOtpTimer > 0
                          ? `Resend verification code in ${recoveryEmailOtpTimer}s`
                          : `Didn't receive code? Resend email`}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setRecoveryEmailMode(false);
                    setError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '4px',
                    textAlign: 'center',
                  }}
                >
                  ← Back to Authenticator / PIN Verification
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setPending2FAUser(null);
                setPasswordInput('');
                sessionStorage.removeItem('shongjog_pending_2fa');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                fontSize: '12.5px',
                cursor: 'pointer',
                padding: '6px',
                textAlign: 'center',
              }}
            >
              ← Back to Sign In
            </button>
          </form>
        )}

        {/* Security Footer */}
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: '11.5px',
            color: 'var(--text-muted)',
          }}
        >
          <ShieldCheck size={14} color="var(--accent-light)" />
          End-to-end encrypted • Private & Secure
        </div>
      </div>
    </div>
  );
};
