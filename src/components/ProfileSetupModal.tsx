import React, { useState } from 'react';
import { ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { UserProfile } from '../services/db/database';

interface ProfileSetupModalProps {
  onProfileCreated: (profile: UserProfile) => void;
}

export const ProfileSetupModal: React.FC<ProfileSetupModalProps> = ({ onProfileCreated }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phoneNumber.trim()) {
      setError('Please enter your mobile number');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter your full name');
      return;
    }

    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    const generatedUsername = 'user_' + cleanPhone.slice(-6);

    setIsLoading(true);
    try {
      const profile = await IdentityService.setupProfile(
        phoneNumber,
        generatedUsername,
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
        backgroundColor: 'rgba(6, 9, 14, 0.95)',
        backdropFilter: 'blur(32px)',
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
          maxWidth: '460px',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '24px',
          padding: '40px 36px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
          textAlign: 'center',
        }}
      >
        {/* Contact Luxury Brand Mark */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '22px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            margin: '0 auto 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 8px 30px rgba(16, 185, 129, 0.45)',
          }}
        >
          <Sparkles size={36} />
        </div>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: 700,
            color: '#f8fafc',
            letterSpacing: '-0.5px',
            marginBottom: 8,
          }}
        >
          Contact Network
        </h1>
        <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, marginBottom: 30 }}>
          Initialize your private identity to start communicating seamlessly across all networks.
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
              marginBottom: 20,
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18, textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', display: 'block', marginBottom: 8, letterSpacing: '0.4px' }}>
              PHONE NUMBER
            </label>
            <input
              type="tel"
              placeholder="+880 1712 345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="lux-text-input"
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', display: 'block', marginBottom: 8, letterSpacing: '0.4px' }}>
              YOUR DISPLAY NAME
            </label>
            <input
              type="text"
              placeholder="e.g. Tanvir Ahmed"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="lux-text-input"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="lux-primary-btn"
            style={{
              marginTop: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{isLoading ? 'Setting up identity...' : 'Get Started'}</span>
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
