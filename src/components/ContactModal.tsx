import React, { useState, useEffect } from 'react';
import { UserPlus, AtSign, Phone, User, Search, Radio, Globe, X } from 'lucide-react';
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
  const [verifiedPreview, setVerifiedPreview] = useState<any | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Live network verification for manual tab
  useEffect(() => {
    const query = (username.trim() || phoneNumber.trim());
    if (!query || query.length < 3) {
      setVerifiedPreview(null);
      return;
    }
    const timer = setTimeout(async () => {
      setIsVerifying(true);
      try {
        const v = await IdentityService.verifyUserOnNetwork(query);
        setVerifiedPreview(v?.user || null);
        if (v?.user?.displayName && !displayName) {
          setDisplayName(v.user.displayName);
        }
      } catch {}
      finally {
        setIsVerifying(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [username, phoneNumber]);

  // Debounced global search
  useEffect(() => {
    const query = searchQuery.trim();
    if (!query || query.length < 2) {
      const resetTimer = setTimeout(() => {
        setSearchResults([]);
        setIsSearching(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await IdentityService.searchGlobalProfiles(query);
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
    setError('');
    try {
      // 1. Check if user is already saved in local contacts
      const existing = await IdentityService.findExistingContact(user.phoneNumber, user.username, user.id);
      if (existing) {
        // Already exists: update any changed avatar or bio seamlessly without duplicating
        const updated = await IdentityService.addContact(
          user.phoneNumber || existing.phoneNumber || '',
          user.displayName || existing.displayName,
          user.username || existing.username,
          user.publicKey || existing.publicKey,
          user.id || existing.id,
          user.avatarUrl || existing.avatarUrl,
          user.bio || existing.bio
        );
        onContactSaved(updated);
        onClose();
        return;
      }

      const contact = await IdentityService.addContact(
        user.phoneNumber || '',
        user.displayName,
        user.username,
        user.publicKey,
        user.id,
        user.avatarUrl,
        user.bio
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

    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const cleanPhone = phoneNumber.trim();

    setIsSaving(true);
    try {
      // 1. Deduplication check
      const existing = await IdentityService.findExistingContact(cleanPhone, cleanUsername);
      if (existing) {
        setError(`"${existing.displayName}" is already in your contacts.`);
        setIsSaving(false);
        // Switch to that contact after brief delay or offer to start chat
        setTimeout(() => {
          onContactSaved(existing);
          onClose();
        }, 1200);
        return;
      }

      // 2. Network verification
      const verifyQuery = cleanPhone || cleanUsername;
      const verified = await IdentityService.verifyUserOnNetwork(verifyQuery);
      const matchedUser = verified?.user;

      const contact = await IdentityService.addContact(
        cleanPhone || matchedUser?.phoneNumber || '',
        displayName.trim() || matchedUser?.displayName || 'Contact',
        cleanUsername || matchedUser?.username,
        matchedUser?.publicKey,
        matchedUser?.id,
        matchedUser?.avatarUrl,
        matchedUser?.bio
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
      {/* Top Header Bar */}
      <div className="drawer-gradient-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <UserPlus size={18} />
          </div>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--text-pure, #f8fafc)' }}>
              Find or Add Contact
            </h2>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginTop: 1 }}>
              Sovereign P2P & Global Directory
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="drawer-circle-back-btn"
          title="Close Drawer"
        >
          <X size={18} />
        </button>
      </div>

      <div className="drawer-scroll-container">
        {/* Tab Selection */}
        <div className="contact-modal-segmented-tabs">
          <button
            type="button"
            className={`contact-segmented-tab ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            <Globe size={14} />
            <span>Live Global Directory</span>
          </button>
          <button
            type="button"
            className={`contact-segmented-tab ${activeTab === 'manual' ? 'active' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            <UserPlus size={14} />
            <span>Manual Entry</span>
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
              fontSize: '12.5px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: LIVE SEARCH */}
        {activeTab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="luxury-field-shell">
              <Search size={16} color="#10b981" style={{ flexShrink: 0 }} />
              <input
                type="text"
                className="luxury-field-input"
                placeholder="Search by @username, phone, or name..."
                value={searchQuery}
                autoFocus
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 0 }}
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {isSearching && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '36px', color: 'var(--accent-main, #10b981)' }}>
                <Radio className="animate-spin" size={24} />
              </div>
            )}

            {!isSearching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-secondary)', fontSize: '13px', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.08)' }}>
                No registered peers found matching "{searchQuery}". Try switching to <strong>Manual Entry</strong>.
              </div>
            )}

            {!isSearching && searchQuery.trim().length < 2 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <Globe size={22} />
                </div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-pure)' }}>Search Global Network</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.45 }}>
                  Type at least 2 characters to discover contacts by username, full name, or phone number.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => handleSelectGlobalUser(user)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.035)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    cursor: 'pointer',
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  className="settings-menu-nav-item"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: '11px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontWeight: 700,
                        fontSize: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                      }}
                    >
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        user.displayName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-pure, #f8fafc)' }}>
                        {user.displayName}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--accent-light, #34d399)' }}>
                        @{user.username}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      background: 'var(--accent-main, #10b981)',
                      border: 'none',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
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
          <form onSubmit={handleManualSubmit} className="contact-form-glass-card">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                  Full Name
                </label>
                <span style={{ fontSize: '10px', color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '2px 7px', borderRadius: 6, fontWeight: 600 }}>
                  Required
                </span>
              </div>
              <div className="luxury-field-shell">
                <User size={16} color="#10b981" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  className="luxury-field-input"
                  placeholder="e.g. Tanvir Ahmed"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="contact-field-help-text">
                Appears in your chat list and contact directory.
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                  Username (@handle)
                </label>
                <span style={{ fontSize: '10px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '2px 7px', borderRadius: 6, fontWeight: 600 }}>
                  Direct Routing
                </span>
              </div>
              <div className="luxury-field-shell">
                <AtSign size={16} color="#10b981" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  className="luxury-field-input"
                  placeholder="tanvir_bd"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
              </div>
              <div className="contact-field-help-text">
                Unique handle for instant peer routing without requiring phone number.
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                  Phone Number
                </label>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary, #94a3b8)', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 7px', borderRadius: 6, fontWeight: 500 }}>
                  Optional if @username set
                </span>
              </div>
              <div className="luxury-field-shell">
                <Phone size={16} color="#10b981" style={{ flexShrink: 0 }} />
                <input
                  type="tel"
                  className="luxury-field-input"
                  placeholder="+880 1712 345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                />
              </div>
              <div className="contact-field-help-text">
                Full international E.164 format for SMS invitations or peer discovery.
              </div>
            </div>

            {/* Verified Account Preview Badge */}
            {verifiedPreview && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 10,
                  marginTop: 2,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '14px',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {verifiedPreview.avatarUrl ? (
                    <img src={verifiedPreview.avatarUrl} alt={verifiedPreview.displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (verifiedPreview.displayName || 'U').charAt(0).toUpperCase()
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-pure, #fff)' }}>
                      {verifiedPreview.displayName}
                    </span>
                    <span style={{ fontSize: '10px', background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                      ✓ Verified
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--accent-light, #34d399)' }}>
                    @{verifiedPreview.username} {verifiedPreview.phoneNumber ? `• ${verifiedPreview.phoneNumber}` : ''}
                  </div>
                </div>
              </div>
            )}

            {isVerifying && (
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Radio className="animate-spin" size={13} />
                <span>Checking Shongjog network directory...</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="modal-primary-btn-lux"
              style={{ width: '100%', height: '46px', marginTop: 4 }}
            >
              <UserPlus size={17} />
              <span>{isSaving ? 'Adding Contact...' : 'Add Contact & Start Chat'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
