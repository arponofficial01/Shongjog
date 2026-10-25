import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  AtSign,
  Phone,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
  Camera,
  FileText,
} from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import { AuthService } from '../services/auth/authService';
import type { UserProfile } from '../services/db/database';

interface ProfileSetupModalProps {
  onProfileCreated: (profile: UserProfile) => void;
}

type AuthStep = 'phone' | 'otp' | 'profile';

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onProfileCreated }) => {
  const [step, setStep] = useState<AuthStep>('phone');
  
  // Step 1: Phone
  const [phoneInput, setPhoneInput] = useState('');
  const [detectedOperator, setDetectedOperator] = useState<string | null>(null);
  const [formattedPhone, setFormattedPhone] = useState('');

  // Step 2: OTP
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [devOtpNotification, setDevOtpNotification] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 3: Profile Setup (Name, Username, Avatar, Description/Bio)
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [bio, setBio] = useState<string>('Available on Shongjog direct network');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Shared
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Real-time phone operator detection
  useEffect(() => {
    if (phoneInput.trim().length >= 3) {
      const val = IdentityService.validateBangladeshPhone(phoneInput);
      if (val.isValid && val.operator) {
        setDetectedOperator(val.operator);
        setFormattedPhone(val.formatted);
        setError('');
      } else {
        setDetectedOperator(null);
      }
    } else {
      setDetectedOperator(null);
    }
  }, [phoneInput]);

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
      setUsernameStatus('idle');
      return;
    }

    setUsernameStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const available = await AuthService.isUsernameAvailable(clean);
        setUsernameStatus(available ? 'available' : 'taken');
      } catch (e) {
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

  // --- Step 1: Send OTP ---
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
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
          onProfileCreated(res.existingProfile);
        } else {
          // New citizen: proceed to name, avatar, username, and description step
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

    setIsLoading(true);
    try {
      const profile = await IdentityService.setupProfile(
        formattedPhone,
        cleanUsername,
        displayName.trim(),
        avatarUrl || undefined,
        bio.trim() || undefined
      );
      onProfileCreated(profile);
    } catch (err: any) {
      setError(err.message || 'Failed to complete profile synchronization');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 13, 0.95)',
        backdropFilter: 'blur(36px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '490px',
          background: 'rgba(12, 19, 32, 0.94)',
          border: '1px solid var(--border-glass-bright)',
          borderRadius: '26px',
          padding: '36px 32px',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.85), 0 0 35px var(--accent-glow)',
          textAlign: 'center',
          animation: 'call-fade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative',
        }}
      >
        {/* Header Icon */}
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
            margin: '0 auto 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 8px 30px rgba(16, 185, 129, 0.45)',
          }}
        >
          {step === 'phone' && <Phone size={32} />}
          {step === 'otp' && <KeyRound size={32} />}
          {step === 'profile' && <User size={32} />}
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '25px',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.5px',
            margin: '0 0 4px 0',
          }}
        >
          Shongjog <span style={{ fontFamily: 'var(--font-bangla)', color: 'var(--accent-light)', fontSize: '20px' }}>সংযোগ</span>
        </h1>

        <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: 20 }}>
          {step === 'phone' && 'National Secure Communication Network. Enter your Bangladeshi mobile number.'}
          {step === 'otp' && `Enter the 6-digit verification code sent to ${formattedPhone}`}
          {step === 'profile' && 'Set up your citizen profile picture, username, and description.'}
        </p>

        {/* Global Error Banner */}
        {error && (
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
            STEP 1: PHONE NUMBER INPUT (FIXED INTEGRATED LAYOUT - ZERO OVERLAP)
            ========================================================================= */}
        {step === 'phone' && (
          <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
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

              {/* Integrated Unbreakable Phone Input Box */}
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
                  placeholder="01712 345678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
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

              <div style={{ fontSize: '11px', color: '#64748b', marginTop: 5 }}>
                Supports GP (017/013), Robi (018), Banglalink (019/014), Airtel (016), Teletalk (015).
              </div>
            </div>

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
          </form>
        )}

        {/* =========================================================================
            STEP 2: 6-DIGIT REALTIME OTP VERIFICATION
            ========================================================================= */}
        {step === 'otp' && (
          <div style={{ textAlign: 'center' }}>
            {/* Live Security Notification Banner */}
            {devOtpNotification && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  marginBottom: 18,
                  fontSize: '12.5px',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div>
                  <span style={{ color: '#94a3b8' }}>Security Code: </span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '16px', color: 'var(--accent-light)' }}>
                    {devOtpNotification}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOtpDigits(devOtpNotification.split(''));
                    triggerVerifyOtp(devOtpNotification);
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    background: 'var(--accent-main)',
                    color: '#05080d',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Auto-Fill OTP
                </button>
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
                    color: 'white',
                    fontFamily: 'monospace',
                    boxShadow: digit ? '0 0 12px var(--accent-glow)' : 'none',
                    transition: 'all 0.15s ease',
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
                width: '100%',
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
                  color: '#94a3b8',
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

        {/* =========================================================================
            STEP 3: PROFILE IDENTITY & DESCRIPTION (SYNCED TO SUPABASE)
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
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '18px',
                  background: avatarUrl ? `url(${avatarUrl}) center/cover no-repeat` : 'var(--brand-orb-grad)',
                  border: '2px solid var(--accent-light)',
                  boxShadow: '0 4px 18px var(--accent-glow)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '26px',
                  fontWeight: 700,
                  position: 'relative',
                  flexShrink: 0,
                }}
                title="Click to change photo"
              >
                {!avatarUrl && (displayName ? displayName.charAt(0).toUpperCase() : <User size={30} />)}
                <div
                  style={{
                    position: 'absolute',
                    bottom: -3,
                    right: -3,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--accent-main)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#05080d',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  }}
                >
                  <Camera size={13} />
                </div>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--border-glass)',
                    color: '#f8fafc',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 4,
                  }}
                >
                  <Camera size={14} color="var(--accent-light)" />
                  <span>{avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
                </button>
                <div style={{ fontSize: '11px', color: '#64748b' }}>
                  PNG, JPG or WebP (under 2MB)
                </div>
              </div>
            </div>

            {/* Full Name */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 5, letterSpacing: '0.4px' }}>
                FULL NAME
              </label>
              <input
                type="text"
                placeholder="e.g. Tanvir Ahmed"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="lux-form-input"
                required
                autoFocus
              />
            </div>

            {/* Username */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-light)', letterSpacing: '0.4px' }}>
                  UNIQUE USERNAME (@HANDLE)
                </label>
                {usernameStatus === 'checking' && (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Checking Supabase...</span>
                )}
                {usernameStatus === 'available' && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-light)', fontWeight: 600 }}>✓ Available</span>
                )}
                {usernameStatus === 'taken' && (
                  <span style={{ fontSize: '11px', color: 'var(--rose-danger)', fontWeight: 600 }}>✗ Already Taken</span>
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
              <span>{isLoading ? 'Syncing to Supabase Cloud...' : 'Complete Profile & Launch'}</span>
              <ArrowRight size={18} />
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
            color: '#64748b',
          }}
        >
          <ShieldCheck size={14} color="var(--accent-light)" />
          Hardware ECDSA P-256 cryptographic keys • Synced to Supabase
        </div>
      </div>
    </div>
  );
};
