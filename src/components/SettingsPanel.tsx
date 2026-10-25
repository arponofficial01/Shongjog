import React from 'react';
import {
  ArrowLeft,
  Shield,
  Bell,
  HardDrive,
  LogOut,
  ChevronRight,
  Globe,
  AtSign,
} from 'lucide-react';
import type { UserProfile } from '../services/db/database';
import { getLanguage, setLanguage } from '../i18n/translations';
import type { SupportedLanguage } from '../i18n/translations';

interface SettingsPanelProps {
  profile: UserProfile;
  onBack: () => void;
  onProfileReset: () => void;
  onLanguageChange?: (lang: SupportedLanguage) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  profile,
  onBack,
  onProfileReset,
  onLanguageChange,
}) => {
  const currentLang = getLanguage();

  const handleLanguageToggle = (lang: SupportedLanguage) => {
    setLanguage(lang);
    if (onLanguageChange) onLanguageChange(lang);
  };

  return (
    <div className="luxury-drawer-shell">
      <div className="drawer-gradient-bar">
        <button type="button" onClick={onBack} style={{ color: 'white' }}>
          <ArrowLeft size={22} />
        </button>
        <h2>Settings</h2>
      </div>

      <div className="drawer-scroll-container" style={{ padding: '0' }}>
        {/* Profile Card with @Username Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '24px 20px',
            borderBottom: '1px solid var(--border-glass)',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #10b981 0%, #0369a1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontFamily: 'var(--font-display)',
              fontSize: '28px',
              fontWeight: 700,
              boxShadow: '0 8px 24px rgba(16, 185, 129, 0.35)',
            }}
          >
            {profile.displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '19px', fontWeight: 600, color: '#f8fafc', marginBottom: 2 }}>
              {profile.displayName}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '13px',
                color: '#34d399',
                fontWeight: 600,
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                padding: '2px 8px',
                borderRadius: '6px',
                marginBottom: 4,
              }}
            >
              <AtSign size={12} />
              {profile.username}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {profile.phoneNumber}
            </div>
          </div>
        </div>

        {/* Options List */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Language Switcher */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-glass)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Globe size={20} color="#06b6d4" />
              <div>
                <div style={{ fontSize: '15px', color: '#f8fafc' }}>Language / ভাষা</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>English & বাংলা Interface</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`filter-tab-chip ${currentLang === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageToggle('en')}
                style={{ padding: '3px 10px', fontSize: '11.5px' }}
              >
                EN
              </button>
              <button
                type="button"
                className={`filter-tab-chip ${currentLang === 'bn' ? 'active' : ''}`}
                onClick={() => handleLanguageToggle('bn')}
                style={{ padding: '3px 10px', fontSize: '11.5px' }}
              >
                বাংলা
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-glass)',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Shield size={20} color="#34d399" />
              <div>
                <div style={{ fontSize: '15px', color: '#f8fafc' }}>Privacy & Security</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Hardware ECDSA keys & zero-telemetry</div>
              </div>
            </div>
            <ChevronRight size={18} color="#64748b" />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-glass)',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <Bell size={20} color="#38bdf8" />
              <div>
                <div style={{ fontSize: '15px', color: '#f8fafc' }}>Notifications & Sounds</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Acoustic tones & alert preferences</div>
              </div>
            </div>
            <ChevronRight size={18} color="#64748b" />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-glass)',
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <HardDrive size={20} color="#fbbf24" />
              <div>
                <div style={{ fontSize: '15px', color: '#f8fafc' }}>Storage & Media</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>IndexedDB offline cache & audio notes</div>
              </div>
            </div>
            <ChevronRight size={18} color="#64748b" />
          </div>

          {/* Log Out */}
          <div
            onClick={onProfileReset}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '20px 24px',
              marginTop: 16,
              cursor: 'pointer',
              color: '#f43f5e',
            }}
          >
            <LogOut size={20} color="#f43f5e" />
            <div style={{ fontSize: '15px', fontWeight: 600 }}>Log Out & Reset Identity</div>
          </div>
        </div>
      </div>
    </div>
  );
};
