import React, { useState } from 'react';
import { ArrowLeft, UserPlus, AtSign, Phone, User } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { Contact } from '../services/db/database';

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

    if (!phoneNumber.trim() && !username.trim()) {
      setError('Please provide either a phone number or @username');
      return;
    }

    if (!displayName.trim()) {
      setError('Please enter a contact name');
      return;
    }

    // Default placeholder phone if user only provided username
    const finalPhone = phoneNumber.trim() || '+8801700000000';
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

    setIsSaving(true);
    try {
      const contact = await IdentityService.addContact(
        finalPhone,
        displayName.trim(),
        cleanUsername || undefined
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
    <div className="luxury-drawer-shell">
      <div className="drawer-gradient-bar">
        <button type="button" onClick={onClose} style={{ color: 'white' }}>
          <ArrowLeft size={22} />
        </button>
        <h2>New Contact</h2>
      </div>

      <div className="drawer-scroll-container">
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
          <div className="form-group-field">
            <label>FULL NAME</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix-symbol">
                <User size={16} />
              </span>
              <input
                type="text"
                className="lux-form-input has-prefix"
                placeholder="e.g. Rafiqul Islam"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group-field">
            <label>USERNAME (@HANDLE)</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix-symbol">
                <AtSign size={16} />
              </span>
              <input
                type="text"
                className="lux-form-input has-prefix"
                placeholder="rafiq_bd"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              />
            </div>
          </div>

          <div className="form-group-field">
            <label>PHONE NUMBER (OPTIONAL IF USERNAME PROVIDED)</label>
            <div className="input-prefix-wrapper">
              <span className="input-prefix-symbol">
                <Phone size={16} />
              </span>
              <input
                type="tel"
                className="lux-form-input has-prefix"
                placeholder="+880 1712 345678"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="primary-action-btn-lux"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 }}
          >
            <UserPlus size={18} />
            <span>{isSaving ? 'Adding...' : 'Add Contact & Start Chat'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
