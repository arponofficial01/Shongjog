import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
    <div className="wa-drawer">
      <div className="wa-drawer-header">
        <button type="button" onClick={onClose} style={{ color: 'white' }}>
          <ArrowLeft size={24} />
        </button>
        <h2>New Contact</h2>
      </div>

      <div className="wa-drawer-body">
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
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="wa-drawer-field">
            <label>PHONE NUMBER</label>
            <input
              type="tel"
              className="wa-drawer-input"
              placeholder="+880 1712 345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              required
            />
          </div>

          <div className="wa-drawer-field">
            <label>NAME</label>
            <input
              type="text"
              className="wa-drawer-input"
              placeholder="e.g. Rafiqul Islam"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={isSaving} className="wa-drawer-btn">
            {isSaving ? 'Saving...' : 'Add Contact & Message'}
          </button>
        </form>
      </div>
    </div>
  );
};
