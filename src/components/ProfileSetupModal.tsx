import React, { useState } from 'react';
import { Smartphone, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { UserProfile } from '../services/db/database';
import { t } from '../i18n/translations';

interface ProfileSetupModalProps {
  onProfileCreated: (profile: UserProfile) => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onProfileCreated }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const phoneVal = IdentityService.validateBangladeshPhone(phoneNumber);
    if (!phoneVal.isValid) {
      setError(phoneVal.error || 'Invalid phone format');
      return;
    }

    const userVal = IdentityService.validateUsername(username);
    if (!userVal.isValid) {
      setError(userVal.error || 'Invalid username');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter your display name');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await IdentityService.setupProfile(
        phoneNumber,
        username,
        displayName
      );
      onProfileCreated(profile);
    } catch (err: any) {
      setError(err.message || 'Error creating profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.94)',
        backdropFilter: 'blur(24px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: '#0c1220',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '480px',
          padding: '32px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #10b981 0%, #0d9488 100%)',
              margin: '0 auto 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
              color: 'white',
            }}
          >
            <Smartphone size={28} />
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
            {t('loginTitle')}
          </h1>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: 6 }}>
            {t('loginSubtitle')}
          </p>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              backgroundColor: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: '#fda4af',
              fontSize: '13px',
              marginBottom: 16,
            }}
          >
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              {t('phoneNumber')} (Bangladesh)
            </label>
            <input
              type="tel"
              placeholder={t('phonePlaceholder')}
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              {t('displayName')}
            </label>
            <input
              type="text"
              placeholder={t('displayNamePlaceholder')}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              {t('username')}
            </label>
            <input
              type="text"
              placeholder={t('usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '11px',
              color: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              marginTop: 4,
            }}
          >
            <ShieldCheck size={16} />
            {t('deviceSecurityNotice')}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '12px',
              backgroundColor: 'var(--emerald-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontWeight: 600,
              fontSize: '14px',
              marginTop: 10,
            }}
          >
            <span>{isLoading ? 'Setting up identity...' : t('startMessaging')}</span>
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};
