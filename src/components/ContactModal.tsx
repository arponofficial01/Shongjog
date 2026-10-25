import React, { useState } from 'react';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { Contact } from '../services/db/database';

interface ContactModalProps {
  onClose: () => void;
  onContactSaved: (contact: Contact) => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ onClose, onContactSaved }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!phoneNumber.trim()) {
      setError('Please enter a phone number');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter a contact name');
      return;
    }

    setIsSaving(true);
    try {
      const contact = await IdentityService.addContact(
        phoneNumber,
        displayName.trim()
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
    <div className="contact-drawer">
      <div className="drawer-top-bar">
        <button type="button" onClick={onClose} style={{ color: 'white' }}>
          <ArrowLeft size={22} />
        </button>
        <h2>New Contact</h2>
      </div>

      <div className="drawer-scroll-body">
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
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="lux-form-field">
            <label>MOBILE NUMBER</label>
            <input
              type="tel"
              className="lux-text-input"
              placeholder="+880 1712 345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>

          <div className="lux-form-field">
            <label>FULL NAME</label>
            <input
              type="text"
              className="lux-text-input"
              placeholder="e.g. Rafiqul Islam"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="lux-primary-btn"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}
          >
            <UserPlus size={18} />
            <span>{isSaving ? 'Saving...' : 'Add Contact & Message'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
