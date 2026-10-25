import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Zap, AtSign } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { UserProfile } from '../services/db/database';

interface ProfileSetupModalProps {
  onProfileCreated: (profile: UserProfile) => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onProfileCreated }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phoneNumber.trim()) {
      setError('Please enter your mobile phone number');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter your display name');
      return;
    }

    if (!username.trim()) {
      setError('Please choose a unique username');
      return;
    }

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (cleanUsername.length < 3) {
      setError('Username must be at least 3 characters (letters, numbers, underscores)');
      return;
    }

    setIsLoading(true);
    try {
      const profile = await IdentityService.setupProfile(
        phoneNumber,
        cleanUsername,
        displayName.trim()
      );
      onProfileCreated(profile);
    } catch (err: any) {
      setError(err.message || 'Error initializing profile');
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
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '470px',
          background: 'rgba(12, 19, 32, 0.78)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: '26px',
          padding: '42px 38px',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.12)',
          textAlign: 'center',
          animation: 'call-fade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Shongjog Luxury Orb */}
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: '24px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #047857 100%)',
            margin: '0 auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 8px 32px rgba(16, 185, 129, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.35)',
          }}
        >
          <Zap size={38} />
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.5px',
            marginBottom: 4,
          }}
        >
          Shongjog <span style={{ fontFamily: 'var(--font-bangla)', color: '#34d399', fontSize: '20px' }}>সংযোগ</span>
        </h1>
        <p style={{ fontSize: '13.5px', color: '#94a3b8', lineHeight: 1.6, marginBottom: 28 }}>
          Ultra-private direct communication network. Create your personal identity to get started.
        </p>

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
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', display: 'block', marginBottom: 6, letterSpacing: '0.4px' }}>
              CHOOSE USERNAME
            </label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix-symbol">
                <AtSign size={16} />
              </span>
              <input
                type="text"
                placeholder="rafi_rahman"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="lux-form-input has-prefix"
                required
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', display: 'block', marginBottom: 6, letterSpacing: '0.4px' }}>
              MOBILE NUMBER
            </label>
            <input
              type="tel"
              placeholder="+880 1712 345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="lux-form-input"
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', display: 'block', marginBottom: 6, letterSpacing: '0.4px' }}>
              FULL NAME
            </label>
            <input
              type="text"
              placeholder="e.g. Tanvir Ahmed"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="lux-form-input"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="primary-action-btn-lux"
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{isLoading ? 'Creating identity...' : 'Initialize Identity'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div
          style={{
            marginTop: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: '12px',
            color: '#64748b',
          }}
        >
          <ShieldCheck size={15} color="#10b981" />
          End-to-end encrypted hardware keys
        </div>
      </div>
    </div>
  );
};
