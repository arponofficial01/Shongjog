import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Cloud,
  Globe,
  LogOut,
  Check,
  HardDrive,
} from 'lucide-react';
import { getStorageQuotaInfo } from '../services/db/database';
import type { UserProfile } from '../services/db/database';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabase/supabaseClient';
import { getLanguage, setLanguage, t } from '../i18n/translations';
import type { SupportedLanguage } from '../i18n/translations';

interface SettingsPanelProps {
  profile: UserProfile;
  onProfileReset: () => void;
  onLanguageChange: (lang: SupportedLanguage) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  profile,
  onProfileReset,
  onLanguageChange,
}) => {
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{ usedBytes: number; quotaBytes: number; percentage: number }>({
    usedBytes: 0,
    quotaBytes: 0,
    percentage: 0,
  });

  const currentLang = getLanguage();

  useEffect(() => {
    const config = getSupabaseConfig();
    setSupabaseUrl(config.url || '');
    setSupabaseKey(config.anonKey || '');

    getStorageQuotaInfo().then((info) => setStorageInfo(info));
  }, []);

  const handleSaveSupabase = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(supabaseUrl, supabaseKey);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleLanguageSwitch = (lang: SupportedLanguage) => {
    setLanguage(lang);
    onLanguageChange(lang);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ padding: '24px', maxWidth: '640px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <Settings size={22} color="#10b981" />
        {t('settingsTitle')}
      </h2>

      {/* Language Switcher */}
      <div className="pairing-step-box">
        <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Globe size={18} color="#06b6d4" />
          {t('language')}
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className={`tab-btn ${currentLang === 'en' ? 'active' : ''}`}
            onClick={() => handleLanguageSwitch('en')}
          >
            English
          </button>
          <button
            type="button"
            className={`tab-btn ${currentLang === 'bn' ? 'active' : ''}`}
            onClick={() => handleLanguageSwitch('bn')}
          >
            বাংলা (Bengali)
          </button>
        </div>
      </div>

      {/* Device Identity & Cryptographic Keys */}
      <div className="pairing-step-box">
        <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Shield size={18} color="#10b981" />
          {t('deviceIdentity')}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '12px' }}>
          <div>
            <span style={{ color: '#94a3b8' }}>{t('phoneNumber')}: </span>
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>{profile.phoneNumber}</span>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>{t('username')}: </span>
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>@{profile.username}</span>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>{t('deviceId')}: </span>
            <code style={{ background: '#090d16', padding: '2px 6px', borderRadius: 4, color: '#38bdf8' }}>
              {profile.deviceId}
            </code>
          </div>
          <div>
            <span style={{ color: '#94a3b8' }}>ECDSA Public Key: </span>
            <div className="pairing-code-area" style={{ maxHeight: '60px', marginTop: 4 }}>
              {profile.publicKey || 'Locally Generated Hardware Seed'}
            </div>
          </div>
        </div>
      </div>

      {/* Local Storage Quota Awareness */}
      <div className="pairing-step-box">
        <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <HardDrive size={18} color="#f59e0b" />
          {t('storageUsed')}
        </h3>
        <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            Durable browser IndexedDB used:{' '}
            <strong style={{ color: '#f8fafc' }}>{formatBytes(storageInfo.usedBytes)}</strong>
          </div>
          <div style={{ width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(2, storageInfo.percentage)}%`,
                height: '100%',
                backgroundColor: '#10b981',
              }}
            />
          </div>
        </div>
      </div>

      {/* Supabase Cloud Backend Configuration */}
      <div className="pairing-step-box">
        <h3 style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Cloud size={18} color="#38bdf8" />
          {t('cloudBackend')}
        </h3>
        <form onSubmit={handleSaveSupabase} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              {t('supabaseUrl')}
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://your-project.supabase.co"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
              {t('supabaseAnonKey')}
            </label>
            <input
              type="password"
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOi..."
              style={{ width: '100%' }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 16px',
              backgroundColor: 'var(--emerald-primary)',
              borderRadius: 'var(--radius-sm)',
              color: 'white',
              fontWeight: 600,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {saveSuccess ? <Check size={16} /> : null}
            {saveSuccess ? t('configSaved') : t('saveConfig')}
          </button>
        </form>
      </div>

      {/* Logout / Reset Profile */}
      <button
        type="button"
        onClick={onProfileReset}
        style={{
          padding: '12px',
          backgroundColor: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: 'var(--radius-sm)',
          color: '#fda4af',
          fontWeight: 600,
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <LogOut size={16} />
        {t('logout')}
      </button>
    </div>
  );
};
