import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  CloudLightning,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Laptop,
  ArrowRight,
  KeyRound,
  X,
} from 'lucide-react';
import type { UserProfile } from '../services/db/database';
import { RecoverySyncService } from '../services/sync/recoverySyncService';

interface RecoveryPinModalProps {
  profile: UserProfile;
  isOpen: boolean;
  mode?: 'auto' | 'setup' | 'restore' | 'change';
  onClose?: () => void;
  onSyncComplete: (stats: { messagesCount: number; contactsCount: number; conversationsCount: number }) => void;
}

export const RecoveryPinModal: React.FC<RecoveryPinModalProps> = ({
  profile,
  isOpen,
  mode = 'auto',
  onClose,
  onSyncComplete,
}) => {
  const [actualMode, setActualMode] = useState<'setup' | 'restore' | 'change'>('setup');
  const [changeStep, setChangeStep] = useState<'verify_old' | 'enter_new' | 'confirm_new'>('verify_old');
  
  const [oldPinDigits, setOldPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [pinDigits, setPinDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [confirmDigits, setConfirmDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [isConfirmStep, setIsConfirmStep] = useState(false);
  const [showDigits, setShowDigits] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [successBadge, setSuccessBadge] = useState<string | null>(null);

  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const confirmInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const oldInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Determine mode based on whether user already has a PIN
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    RecoverySyncService.getRecoveryPinStatus(profile).then((status) => {
      if (!mounted) return;
      if (mode === 'change') {
        setActualMode('change');
        setChangeStep(status.hasPin ? 'verify_old' : 'enter_new');
      } else if (mode === 'setup') {
        setActualMode('setup');
      } else if (mode === 'restore') {
        setActualMode('restore');
      } else {
        setActualMode(status.hasPin ? 'restore' : 'setup');
      }
      setIsConfirmStep(false);
      setOldPinDigits(['', '', '', '', '', '']);
      setPinDigits(['', '', '', '', '', '']);
      setConfirmDigits(['', '', '', '', '', '']);
      setErrorMessage('');
      setSuccessBadge(null);
      setTimeout(() => {
        if (mode === 'change' && status.hasPin) {
          oldInputsRef.current[0]?.focus();
        } else {
          inputsRef.current[0]?.focus();
        }
      }, 150);
    });

    return () => {
      mounted = false;
    };
  }, [isOpen, profile, mode]);

  if (!isOpen) return null;

  const getCurrentDigits = () => {
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') return oldPinDigits;
      if (changeStep === 'enter_new') return pinDigits;
      return confirmDigits;
    }
    return isConfirmStep ? confirmDigits : pinDigits;
  };

  const getCurrentSetDigits = () => {
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') return setOldPinDigits;
      if (changeStep === 'enter_new') return setPinDigits;
      return setConfirmDigits;
    }
    return isConfirmStep ? setConfirmDigits : setPinDigits;
  };

  const getCurrentRefs = () => {
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') return oldInputsRef;
      if (changeStep === 'enter_new') return inputsRef;
      return confirmInputsRef;
    }
    return isConfirmStep ? confirmInputsRef : inputsRef;
  };

  const currentDigits = getCurrentDigits();
  const currentSetDigits = getCurrentSetDigits();
  const currentRefs = getCurrentRefs();

  const handleDigitChange = (index: number, value: string) => {
    setErrorMessage('');
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      const next = [...currentDigits];
      next[index] = '';
      currentSetDigits(next);
      return;
    }

    if (clean.length === 1) {
      const next = [...currentDigits];
      next[index] = clean;
      currentSetDigits(next);
      if (index < 5) {
        currentRefs.current[index + 1]?.focus();
      } else {
        const full = next.join('');
        if (full.length === 6) {
          setTimeout(() => {
            handleActionWithPin(full);
          }, 60);
        }
      }
    } else {
      const chars = clean.slice(0, 6).split('');
      const next = [...currentDigits];
      chars.forEach((c, i) => {
        if (i < 6) next[i] = c;
      });
      currentSetDigits(next);
      const focusIndex = Math.min(chars.length, 5);
      currentRefs.current[focusIndex]?.focus();
      if (chars.length === 6) {
        setTimeout(() => {
          handleActionWithPin(chars.join(''));
        }, 60);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !currentDigits[index] && index > 0) {
      currentRefs.current[index - 1]?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAction();
    }
  };

  const fullOldPin = oldPinDigits.join('');
  const fullPin = pinDigits.join('');
  const fullConfirm = confirmDigits.join('');

  const triggerErrorShake = (msg: string) => {
    setErrorMessage(msg);
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 600);
  };

  const handleActionWithPin = async (overrideDigits?: string) => {
    await performAction(overrideDigits);
  };

  const handleAction = async () => {
    await performAction();
  };

  const performAction = async (overrideDigits?: string) => {
    setErrorMessage('');

    // --- CHANGE PIN MODE ---
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') {
        const oldVal = overrideDigits || fullOldPin;
        if (oldVal.length !== 6) {
          triggerErrorShake('Please enter your 6-digit current PIN.');
          return;
        }

        try {
          setIsLoading(true);
          setStatusMessage('🔑 Verifying current PIN...');
          const isValid = await RecoverySyncService.verifyPin(profile, oldVal);
          if (!isValid) {
            triggerErrorShake('Current Recovery PIN is incorrect. Please try again.');
            setOldPinDigits(['', '', '', '', '', '']);
            setTimeout(() => oldInputsRef.current[0]?.focus(), 100);
            return;
          }
          setStatusMessage('');
          setChangeStep('enter_new');
          setTimeout(() => inputsRef.current[0]?.focus(), 100);
        } catch (err: any) {
          triggerErrorShake(err.message || 'Verification error.');
        } finally {
          setIsLoading(false);
        }
        return;
      }

      if (changeStep === 'enter_new') {
        const newVal = overrideDigits || fullPin;
        if (newVal.length !== 6) {
          triggerErrorShake('Please enter all 6 digits of your new PIN.');
          return;
        }
        setChangeStep('confirm_new');
        setTimeout(() => confirmInputsRef.current[0]?.focus(), 100);
        return;
      }

      // In confirm_new step
      const confVal = overrideDigits || fullConfirm;
      if (confVal.length !== 6) {
        triggerErrorShake('Please confirm all 6 digits.');
        return;
      }
      if (fullPin !== confVal) {
        triggerErrorShake('PINs do not match. Please re-enter new PIN confirmation.');
        setConfirmDigits(['', '', '', '', '', '']);
        setTimeout(() => confirmInputsRef.current[0]?.focus(), 100);
        return;
      }

      try {
        setIsLoading(true);
        setStatusMessage('🔐 Updating Recovery PIN and re-encrypting cloud backup...');
        await RecoverySyncService.setRecoveryPin(profile, fullPin);

        setStatusMessage('☁️ Re-syncing encrypted backup across all devices...');
        const stats = await RecoverySyncService.performFullCloudRestoreAndSync(profile, (msg) => {
          setStatusMessage(msg);
        });

        setSuccessBadge('✓ Chat Backup PIN Updated Successfully! All devices synced.');
        setTimeout(() => {
          onSyncComplete(stats);
          onClose?.();
        }, 1200);
      } catch (err: any) {
        triggerErrorShake(err.message || 'Could not update PIN. Please check your connection.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // --- SETUP MODE ---
    if (actualMode === 'setup') {
      if (!isConfirmStep) {
        const pin = overrideDigits || fullPin;
        if (pin.length !== 6) {
          triggerErrorShake('Please enter all 6 digits of your Recovery PIN.');
          return;
        }
        setIsConfirmStep(true);
        setTimeout(() => confirmInputsRef.current[0]?.focus(), 100);
        return;
      }

      // In confirm step
      const conf = overrideDigits || fullConfirm;
      if (conf.length !== 6) {
        triggerErrorShake('Please confirm all 6 digits.');
        return;
      }
      if (fullPin !== conf) {
        triggerErrorShake('Incorrect PIN. The 6 digits do not match. Please re-enter.');
        setConfirmDigits(['', '', '', '', '', '']);
        setTimeout(() => confirmInputsRef.current[0]?.focus(), 100);
        return;
      }

      try {
        setIsLoading(true);
        setStatusMessage('🔐 Securing your 6-digit Recovery PIN...');
        await RecoverySyncService.setRecoveryPin(profile, fullPin);

        setStatusMessage('☁️ Synchronizing cloud chat backup across all devices...');
        const stats = await RecoverySyncService.performFullCloudRestoreAndSync(profile, (msg) => {
          setStatusMessage(msg);
        });

        setSuccessBadge(`✓ Instant Sync Activated! Restored ${stats.messagesCount} messages across devices.`);
        setTimeout(() => {
          onSyncComplete(stats);
          onClose?.();
        }, 1200);
      } catch (err: any) {
        triggerErrorShake(err.message || 'Could not set Recovery PIN. Check your connection.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // --- RESTORE MODE ---
      const pin = overrideDigits || fullPin;
      if (pin.length !== 6) {
        triggerErrorShake('Please enter your 6-digit Recovery PIN.');
        return;
      }

      try {
        setIsLoading(true);
        setStatusMessage('🔑 Verifying Recovery PIN...');
        const isValid = await RecoverySyncService.verifyPin(profile, pin);
        if (!isValid) {
          triggerErrorShake('Incorrect PIN. The Recovery PIN entered is invalid. Please try again.');
          setIsLoading(false);
          return;
        }

        setStatusMessage('📥 Decrypting & restoring chats from cloud...');
        const stats = await RecoverySyncService.performFullCloudRestoreAndSync(profile, (msg) => {
          setStatusMessage(msg);
        });

        setSuccessBadge(`✓ All Devices Synced! ${stats.messagesCount} messages & ${stats.contactsCount} contacts restored.`);
        setTimeout(() => {
          onSyncComplete(stats);
          onClose?.();
        }, 1200);
      } catch (err: any) {
        triggerErrorShake(err.message || 'Error syncing data from cloud.');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const getHeaderTitle = () => {
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') return 'Enter Current Recovery PIN';
      if (changeStep === 'enter_new') return 'Enter New 6-Digit PIN';
      return 'Confirm New 6-Digit PIN';
    }
    if (actualMode === 'restore') return 'Enter Chat Backup Recovery PIN';
    if (isConfirmStep) return 'Confirm Your 6-Digit PIN';
    return 'Set Chat Backup & Recovery PIN';
  };

  const getHeaderSubtitle = () => {
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') return 'To change your backup PIN, verify your current 6-digit PIN first.';
      if (changeStep === 'enter_new') return 'Choose a new 6-digit PIN to re-encrypt your chat backup across all devices.';
      return 'Re-enter your new 6-digit PIN to confirm.';
    }
    if (actualMode === 'restore') {
      return 'Enter your 6-digit Recovery PIN to decrypt and instantly synchronize all your messages, contacts, and media on this device.';
    }
    if (isConfirmStep) {
      return 'Re-enter your 6-digit PIN to confirm and activate instant cross-device synchronization.';
    }
    return 'End-to-end encrypted backup. Set a 6-digit Recovery PIN so your chats and files instantly sync between your phone and laptop.';
  };

  const isButtonEnabled = () => {
    if (isLoading) return false;
    return currentDigits.join('').length === 6;
  };

  const getButtonText = () => {
    if (isLoading) {
      return actualMode === 'change' ? 'Updating & Syncing...' : 'Restoring & Synchronizing...';
    }
    if (actualMode === 'change') {
      if (changeStep === 'verify_old') return 'Verify Current PIN';
      if (changeStep === 'enter_new') return 'Next: Confirm PIN';
      return 'Confirm & Update PIN';
    }
    if (actualMode === 'restore') return 'Restore & Sync All Devices';
    if (isConfirmStep) return 'Confirm PIN & Enable Live Sync';
    return 'Next: Confirm PIN';
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(3, 7, 18, 0.88)',
        backdropFilter: 'blur(16px)',
        padding: '16px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#0c131f',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '24px',
          padding: '28px 24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(16, 185, 129, 0.15)',
          color: '#f8fafc',
          position: 'relative',
        }}
      >
        {/* Dismiss Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: '18px',
              right: '18px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={16} />
          </button>
        )}

        {/* Header Icon & Badges */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '14px',
              boxShadow: '0 0 25px rgba(16, 185, 129, 0.2)',
            }}
          >
            {actualMode === 'restore' ? (
              <CloudLightning size={32} color="#10b981" />
            ) : actualMode === 'change' ? (
              <KeyRound size={32} color="#10b981" />
            ) : (
              <ShieldCheck size={32} color="#10b981" />
            )}
          </div>

          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 8px 0', color: '#fff' }}>
            {getHeaderTitle()}
          </h2>

          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>
            {getHeaderSubtitle()}
          </p>

          {/* Multi-Device Graphic Pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '6px 14px',
              borderRadius: '20px',
              marginTop: '12px',
              fontSize: '12px',
              color: '#34d399',
            }}
          >
            <Smartphone size={14} />
            <span>Phone</span>
            <span style={{ opacity: 0.5 }}>⇄</span>
            <Laptop size={14} />
            <span>Laptop</span>
            <span style={{ color: '#94a3b8' }}>• Instant Live Sync</span>
          </div>
        </div>

        {/* 6 Digit Input Boxes */}
        <div style={{ marginBottom: '22px' }}>
          <div
            className={isShaking ? 'pin-error-shake' : ''}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '10px',
              marginBottom: '12px',
            }}
          >
            {currentDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  currentRefs.current[i] = el;
                }}
                type={showDigits ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                disabled={isLoading}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                style={{
                  width: '46px',
                  height: '56px',
                  borderRadius: '12px',
                  backgroundColor: errorMessage
                    ? 'rgba(239, 68, 68, 0.08)'
                    : digit
                    ? 'rgba(16, 185, 129, 0.08)'
                    : 'rgba(15, 23, 42, 0.7)',
                  border: errorMessage
                    ? '2px solid #ef4444'
                    : digit
                    ? '2px solid #10b981'
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  color: errorMessage ? '#fca5a5' : '#fff',
                  fontSize: '24px',
                  fontWeight: 700,
                  textAlign: 'center',
                  outline: 'none',
                  transition: 'all 0.15s ease',
                  boxShadow: errorMessage
                    ? '0 0 14px rgba(239, 68, 68, 0.35)'
                    : digit
                    ? '0 0 12px rgba(16, 185, 129, 0.25)'
                    : 'none',
                }}
              />
            ))}
          </div>

          {/* Visibility toggle & Hint */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>
              {actualMode === 'change'
                ? changeStep === 'verify_old'
                  ? 'Step 1 of 3: Enter current PIN'
                  : changeStep === 'enter_new'
                  ? 'Step 2 of 3: Enter new PIN'
                  : 'Step 3 of 3: Confirm new PIN'
                : isConfirmStep
                ? 'Step 2 of 2: Confirmation'
                : '6 numeric digits required'}
            </span>
            <button
              type="button"
              onClick={() => setShowDigits(!showDigits)}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              {showDigits ? <EyeOff size={14} /> : <Eye size={14} />}
              {showDigits ? 'Hide PIN' : 'Show PIN'}
            </button>
          </div>
        </div>

        {/* Status / Error Notifications */}
        {errorMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#34d399',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '12px',
              marginBottom: '16px',
            }}
          >
            <RefreshCw size={16} className="animate-spin" style={{ flexShrink: 0 }} />
            <span>{statusMessage}</span>
          </div>
        )}

        {successBadge && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.18)',
              border: '1px solid #10b981',
              color: '#10b981',
              padding: '10px 14px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              marginBottom: '16px',
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successBadge}</span>
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            disabled={!isButtonEnabled()}
            onClick={handleAction}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '14px',
              backgroundColor: isButtonEnabled() ? '#10b981' : 'rgba(16, 185, 129, 0.25)',
              color: isButtonEnabled() ? '#05080d' : '#94a3b8',
              fontWeight: 700,
              fontSize: '15px',
              border: 'none',
              cursor: isButtonEnabled() ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow: isButtonEnabled() ? '0 4px 20px rgba(16, 185, 129, 0.35)' : 'none',
            }}
          >
            {isLoading ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>{getButtonText()}</span>
              </>
            ) : actualMode === 'restore' ? (
              <>
                <CloudLightning size={18} />
                <span>{getButtonText()}</span>
              </>
            ) : actualMode === 'change' ? (
              <>
                <KeyRound size={18} />
                <span>{getButtonText()}</span>
              </>
            ) : isConfirmStep ? (
              <>
                <CheckCircle2 size={18} />
                <span>{getButtonText()}</span>
              </>
            ) : (
              <>
                <span>{getButtonText()}</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>

          {/* Secondary links */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
            {actualMode === 'change' && changeStep !== 'verify_old' ? (
              <button
                type="button"
                onClick={() => {
                  setChangeStep('verify_old');
                  setOldPinDigits(['', '', '', '', '', '']);
                  setPinDigits(['', '', '', '', '', '']);
                  setConfirmDigits(['', '', '', '', '', '']);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ← Back
              </button>
            ) : actualMode === 'setup' && isConfirmStep ? (
              <button
                type="button"
                onClick={() => {
                  setIsConfirmStep(false);
                  setConfirmDigits(['', '', '', '', '', '']);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                ← Back to change PIN
              </button>
            ) : (
              <div />
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
