import React, { useState } from 'react';
import { UserPlus, Phone, User, Check, AlertCircle } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { Contact } from '../services/db/database';
import { t } from '../i18n/translations';

interface ContactModalProps {
  onClose: () => void;
  onContactSaved: (contact: Contact) => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ onClose, onContactSaved }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const phoneVal = IdentityService.validateBangladeshPhone(phoneNumber);
    if (!phoneVal.isValid) {
      setError(phoneVal.error || 'Invalid phone number');
      return;
    }

    if (!displayName.trim()) {
      setError('Please provide a contact name');
      return;
    }

    setIsSaving(true);
    try {
      const contact = await IdentityService.addContact(
        phoneNumber,
        displayName,
        username || undefined
      );
      onContactSaved(contact);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save contact');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.85)',
        backdropFilter: 'blur(16px)',
        zIndex: 90,
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
          maxWidth: '440px',
          padding: '24px',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={20} color="#10b981" />
            {t('newContactTitle')}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.08)',
              fontSize: '13px',
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
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
            <div style={{ position: 'relative' }}>
              <input
                type="tel"
                placeholder={t('phonePlaceholder')}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px' }}
                required
              />
              <Phone
                size={16}
                color="#64748b"
                style={{ position: 'absolute', left: 12, top: 12 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              {t('displayName')}
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={t('displayNamePlaceholder')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ width: '100%', paddingLeft: '36px' }}
                required
              />
              <User
                size={16}
                color="#64748b"
                style={{ position: 'absolute', left: 12, top: 12 }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              {t('username')} (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. rafi123"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
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
            <Check size={18} />
            {isSaving ? 'Saving...' : t('addContact')}
          </button>
        </form>
      </div>
    </div>
  );
};
