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

  // Step 3: Profile Setup
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

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

  // --- Step 1: Send OTP ---
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!navigator.onLine) {
      setError('You must be connected to the internet to verify your phone number.');
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
          // Returning citizen: automatically signed in!
          onProfileCreated(res.existingProfile);
        } else {
          // New citizen: proceed to name and username step
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

  // --- Step 3: Complete Profile ---
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
        displayName.trim()
      );
      onProfileCreated(profile);
    } catch (err: any) {
      setError(err.message || 'Failed to complete profile creation');
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
          maxWidth: '480px',
          background: 'rgba(12, 19, 32, 0.92)',
          border: '1px solid var(--border-glass-bright)',
          borderRadius: '26px',
          padding: '38px 34px',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.8), 0 0 35px var(--accent-glow)',
          textAlign: 'center',
          animation: 'call-fade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          position: 'relative',
        }}
      >
        {/* Header Icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
            margin: '0 auto 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 8px 30px rgba(16, 185, 129, 0.45)',
          }}
        >
          {step === 'phone' && <Phone size={34} />}
          {step === 'otp' && <KeyRound size={34} />}
          {step === 'profile' && <User size={34} />}
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '26px',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.5px',
            margin: '0 0 4px 0',
          }}
        >
          Shongjog <span style={{ fontFamily: 'var(--font-bangla)', color: 'var(--accent-light)', fontSize: '20px' }}>সংযোগ</span>
        </h1>

        <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginBottom: 22 }}>
          {step === 'phone' && 'National Secure Communication Network. Enter your Bangladeshi mobile number.'}
          {step === 'otp' && `Enter the 6-digit verification code sent to ${formattedPhone}`}
          {step === 'profile' && 'Choose your unique cryptographic handle and display name.'}
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
              marginBottom: 18,
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
            STEP 1: PHONE NUMBER INPUT
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

              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol" style={{ fontSize: '14px', color: 'var(--accent-light)', fontWeight: 600 }}>
                  🇧🇩 +880
                </span>
                <input
                  type="tel"
                  placeholder="01712 345678"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="lux-form-input"
                  style={{ paddingLeft: '80px', fontSize: '15px', letterSpacing: '0.5px' }}
                  required
                  autoFocus
                />
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: 4 }}>
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
            {/* Live OTP Notification Banner */}
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
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '15px', color: 'var(--accent-light)' }}>
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
                    padding: '4px 10px',
                    borderRadius: '6px',
                    background: 'var(--accent-main)',
                    color: '#05080d',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Auto-Fill OTP
                </button>
              </div>
            )}

            {/* 6-Digit Individual Input Boxes */}
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
            STEP 3: PROFILE IDENTITY REGISTRATION (FOR NEW CITIZENS)
            ========================================================================= */}
        {step === 'profile' && (
          <form onSubmit={handleProfileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
            <div>
              <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--accent-light)', display: 'block', marginBottom: 6, letterSpacing: '0.4px' }}>
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

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--accent-light)', letterSpacing: '0.4px' }}>
                  UNIQUE USERNAME (@HANDLE)
                </label>
                {usernameStatus === 'checking' && (
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>Checking availability...</span>
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
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: 4 }}>
                This is your cryptographic address across the Shongjog network.
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
              <span>{isLoading ? 'Generating Hardware Keys...' : 'Launch Encrypted Shongjog'}</span>
              <ArrowRight size={18} />
            </button>
          </form>
        )}

        {/* Security Footer */}
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: '11.5px',
            color: '#64748b',
          }}
        >
          <ShieldCheck size={14} color="var(--accent-light)" />
          Hardware ECDSA P-256 air-gapped cryptographic keys
        </div>
      </div>
    </div>
  );
};
