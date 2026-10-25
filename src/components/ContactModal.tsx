import React, { useState, useEffect } from 'react';
import { ArrowLeft, UserPlus, AtSign, Phone, User, Search, Radio } from 'lucide-react';
import { IdentityService } from '../services/identity/identityService';
import type { Contact } from '../services/db/database';

interface ContactModalProps {
  onClose: () => void;
  onContactSaved: (contact: Contact) => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ onClose, onContactSaved }) => {
  const [activeTab, setActiveTab] = useState<'search' | 'manual'>('search');
  
  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Manual tab state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Debounced global search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await IdentityService.searchGlobalProfiles(searchQuery);
        setSearchResults(results);
      } catch (e) {
        console.warn('Search error', e);
      } finally {
        setIsSearching(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSelectGlobalUser = async (user: any) => {
    setIsSaving(true);
    try {
      const contact = await IdentityService.addContact(
        user.phoneNumber || '+8801700000000',
        user.displayName,
        user.username,
        user.publicKey
      );
      onContactSaved(contact);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
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
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '19px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
          Find or Add Contact
        </h2>
      </div>

      <div className="drawer-scroll-container">
        {/* Tab Selection */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          <button
            type="button"
            className={`filter-tab-chip ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            style={{ flex: 1, textAlign: 'center', padding: '9px 12px', fontSize: '13px' }}
          >
            Live Global Directory
          </button>
          <button
            type="button"
            className={`filter-tab-chip ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
            style={{ flex: 1, textAlign: 'center', padding: '9px 12px', fontSize: '13px' }}
          >
            Manual Entry
          </button>
        </div>

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

        {/* TAB 1: LIVE SEARCH */}
        {activeTab === 'search' && (
          <div>
            <div className="form-group-field" style={{ marginBottom: 16 }}>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  className="lux-form-input has-prefix"
                  placeholder="Search by @username, phone, or name..."
                  value={searchQuery}
                  autoFocus
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px', color: 'var(--accent-light)' }}>
                <Radio className="animate-spin" size={24} />
              </div>
            )}

            {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8', fontSize: '13.5px' }}>
                No registered users found matching "{searchQuery}".
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleSelectGlobalUser(user)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-glass)',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                  className="settings-menu-nav-item"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '10px',
                        background: 'var(--brand-orb-grad)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '16px',
                      }}
                    >
                      {user.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                        {user.displayName}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--accent-light)' }}>
                        @{user.username}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      background: 'var(--bg-outgoing-grad)',
                      border: 'none',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Start Chat
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: MANUAL ENTRY */}
        {activeTab === 'manual' && (
          <form onSubmit={handleManualSubmit}>
            <div className="form-group-field">
              <label>FULL NAME</label>
              <div className="input-prefix-wrapper">
                <span className="input-prefix-symbol">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  className="lux-form-input has-prefix"
                  placeholder="e.g. Tanvir Ahmed"
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
                  placeholder="tanvir_bd"
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
        )}
      </div>
    </div>
  );
};
