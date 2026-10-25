import React, { useState } from 'react';
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
      setError('Please enter your phone number');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter your name');
      return;
    }

    // Auto-generate username from phone if not provided
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
        backgroundColor: '#111b21',
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
          maxWidth: '440px',
          textAlign: 'center',
        }}
      >
        {/* WhatsApp Logo Graphic */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            backgroundColor: '#00a884',
            margin: '0 auto 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="44"
            height="44"
            fill="white"
          >
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z" />
          </svg>
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 400, color: '#e9edef', marginBottom: 12 }}>
          Welcome to WhatsApp
        </h1>
        <p style={{ fontSize: '14px', color: '#8696a0', marginBottom: 32, lineHeight: 1.5 }}>
          Enter your phone number and profile name to start chatting with your contacts.
        </p>

        {error && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: 'rgba(234, 0, 56, 0.15)',
              border: '1px solid #ea0038',
              borderRadius: '6px',
              color: '#ff859b',
              fontSize: '13px',
              marginBottom: 20,
              textAlign: 'left',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, textAlign: 'left' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#00a884', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              PHONE NUMBER
            </label>
            <input
              type="tel"
              placeholder="+880 1712 345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              style={{
                width: '100%',
                background: '#202c33',
                border: '1px solid #2a3942',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '16px',
                color: '#e9edef',
              }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#00a884', display: 'block', marginBottom: 6, fontWeight: 500 }}>
              YOUR NAME
            </label>
            <input
              type="text"
              placeholder="e.g. Tanvir Ahmed"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{
                width: '100%',
                background: '#202c33',
                border: '1px solid #2a3942',
                borderRadius: '8px',
                padding: '12px 14px',
                fontSize: '16px',
                color: '#e9edef',
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '13px',
              backgroundColor: '#00a884',
              borderRadius: '24px',
              color: '#111b21',
              fontWeight: 600,
              fontSize: '15px',
              marginTop: 12,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {isLoading ? 'Connecting...' : 'Agree & Continue'}
          </button>
        </form>

        <div style={{ marginTop: 36, fontSize: '12px', color: '#667781' }}>
          🔒 End-to-end encrypted messaging & calls
        </div>
      </div>
    </div>
  );
};
