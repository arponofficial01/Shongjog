import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Shield,
  HardDrive,
  LogOut,
  Globe,
  AtSign,
  Palette,
  Sparkles,
  Type,
  Volume2,
  Check,
  Trash2,
  Cpu,
  Fingerprint,
} from 'lucide-react';
import type { UserProfile } from '../services/db/database';
import { getLanguage, setLanguage } from '../i18n/translations';
import type { SupportedLanguage } from '../i18n/translations';
import { getDatabase } from '../services/db/database';

export type ThemeOption = 'emerald' | 'sapphire' | 'amethyst' | 'gold' | 'ruby';
export type WallpaperOption = 'aurora' | 'grid' | 'minimal' | 'stars';
export type FontSizeOption = 'compact' | 'standard' | 'spacious';
export type BubbleStyleOption = 'squircle' | 'pill' | 'sharp';

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

  const [activeTheme, setActiveTheme] = useState<ThemeOption>(
    (localStorage.getItem('shongjog_theme') as ThemeOption) || 'emerald'
  );
  const [activeWallpaper, setActiveWallpaper] = useState<WallpaperOption>(
    (localStorage.getItem('shongjog_wallpaper') as WallpaperOption) || 'aurora'
  );
  const [activeFontSize, setActiveFontSize] = useState<FontSizeOption>(
    (localStorage.getItem('shongjog_font_size') as FontSizeOption) || 'standard'
  );
  const [activeBubbleStyle, setActiveBubbleStyle] = useState<BubbleStyleOption>(
    (localStorage.getItem('shongjog_bubble_style') as BubbleStyleOption) || 'squircle'
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    localStorage.getItem('shongjog_sound_fx') !== 'false'
  );

  const [storageStats, setStorageStats] = useState({ messagesCount: 0, contactsCount: 0, conversationsCount: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const db = await getDatabase();
        const mCount = await db.count('messages');
        const cCount = await db.count('contacts');
        const convCount = await db.count('conversations');
        setStorageStats({ messagesCount: mCount, contactsCount: cCount, conversationsCount: convCount });
      } catch (e) {
        console.warn('Could not read storage counts', e);
      }
    }
    loadStats();
  }, []);

  const handleThemeChange = (theme: ThemeOption) => {
    setActiveTheme(theme);
    localStorage.setItem('shongjog_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  };

  const handleWallpaperChange = (wp: WallpaperOption) => {
    setActiveWallpaper(wp);
    localStorage.setItem('shongjog_wallpaper', wp);
    document.documentElement.setAttribute('data-wallpaper', wp);
  };

  const handleFontSizeChange = (size: FontSizeOption) => {
    setActiveFontSize(size);
    localStorage.setItem('shongjog_font_size', size);
    document.documentElement.setAttribute('data-font-size', size);
  };

  const handleBubbleStyleChange = (style: BubbleStyleOption) => {
    setActiveBubbleStyle(style);
    localStorage.setItem('shongjog_bubble_style', style);
    document.documentElement.setAttribute('data-bubble-style', style);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('shongjog_sound_fx', next ? 'true' : 'false');
  };

  const handleLanguageToggle = (lang: SupportedLanguage) => {
    setLanguage(lang);
    if (onLanguageChange) onLanguageChange(lang);
  };

  const handleClearCacheData = async () => {
    if (confirm('Are you sure you want to purge all stored messages from offline cache? Your contacts and profile will be preserved.')) {
      try {
        const db = await getDatabase();
        await db.clear('messages');
        setStorageStats((prev) => ({ ...prev, messagesCount: 0 }));
        alert('Offline message cache purged successfully.');
      } catch (e) {
        console.error('Failed to clear cache', e);
      }
    }
  };

  const themes: { id: ThemeOption; name: string; color: string; bg: string }[] = [
    { id: 'emerald', name: 'Emerald', color: '#10b981', bg: 'linear-gradient(135deg, #10b981, #059669)' },
    { id: 'sapphire', name: 'Sapphire', color: '#0284c7', bg: 'linear-gradient(135deg, #38bdf8, #0284c7)' },
    { id: 'amethyst', name: 'Amethyst', color: '#8b5cf6', bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
    { id: 'gold', name: 'Gold', color: '#eab308', bg: 'linear-gradient(135deg, #fde047, #ca8a04)' },
    { id: 'ruby', name: 'Ruby', color: '#f43f5e', bg: 'linear-gradient(135deg, #fb7185, #e11d48)' },
  ];

  return (
    <div className="luxury-drawer-shell">
      {/* Top Header Bar */}
      <div className="drawer-gradient-bar">
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            padding: 4,
          }}
          title="Back to Chats"
        >
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
          Settings & Preferences
        </h2>
      </div>

      {/* Segmented Settings Scroll Body */}
      <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
        
        {/* =========================================================================
            SECTION 1: PROFILE & CRYPTOGRAPHIC IDENTITY
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Fingerprint size={14} />
            <span>Profile & Cryptographic Identity</span>
          </div>

          <div className="settings-card-frame">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '20px 18px' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--brand-orb-grad)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontFamily: 'var(--font-display)',
                  fontSize: '26px',
                  fontWeight: 700,
                  boxShadow: '0 8px 24px var(--accent-glow)',
                  flexShrink: 0,
                }}
              >
                {profile.displayName.charAt(0).toUpperCase()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: 2 }}>
                  {profile.displayName}
                </div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '12.5px',
                    color: 'var(--accent-light)',
                    fontWeight: 600,
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    marginBottom: 4,
                  }}
                >
                  <AtSign size={12} />
                  {profile.username}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {profile.phoneNumber || 'P2P Identity Active'}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 18px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid var(--border-glass)', fontSize: '11.5px', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Hardware Device ID:</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent-light)' }}>
                {profile.deviceId ? profile.deviceId.slice(0, 16) + '...' : 'SECURE_SANDBOX'}
              </span>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 2: LUXURY THEME PALETTES
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Palette size={14} />
            <span>Theme & Color Presets</span>
          </div>

          <div className="settings-card-frame" style={{ padding: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {themes.map((th) => {
                const isSelected = activeTheme === th.id;
                return (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => handleThemeChange(th.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: '10px 4px',
                      borderRadius: '10px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                      border: isSelected ? `1.5px solid ${th.color}` : '1.5px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    title={th.name}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: th.bg,
                        boxShadow: isSelected ? `0 0 14px ${th.color}` : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check size={16} color="white" />}
                    </div>
                    <span style={{ fontSize: '11px', color: isSelected ? '#ffffff' : '#94a3b8', fontWeight: isSelected ? 600 : 400 }}>
                      {th.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 3: AMBIENT WALLPAPER & ATMOSPHERE
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Sparkles size={14} />
            <span>Ambient Wallpaper & Atmosphere</span>
          </div>

          <div className="settings-card-frame" style={{ padding: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {[
                { id: 'aurora', label: 'Aurora Drift' },
                { id: 'grid', label: 'Cyber Grid' },
                { id: 'stars', label: 'Starlight Dots' },
                { id: 'minimal', label: 'Pure Obsidian' },
              ].map((wp) => {
                const isSelected = activeWallpaper === wp.id;
                return (
                  <button
                    key={wp.id}
                    type="button"
                    onClick={() => handleWallpaperChange(wp.id as WallpaperOption)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid var(--accent-light)' : '1px solid var(--border-glass)',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      fontSize: '12.5px',
                      fontWeight: isSelected ? 600 : 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.18s ease',
                    }}
                  >
                    <span>{wp.label}</span>
                    {isSelected && <Check size={14} color="var(--accent-light)" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 4: CHAT TYPOGRAPHY & BUBBLE STYLING
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Type size={14} />
            <span>Typography & Bubble Corners</span>
          </div>

          <div className="settings-card-frame" style={{ padding: '16px' }}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 8, fontWeight: 500 }}>
                Chat Font Scale
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['compact', 'standard', 'spacious'] as FontSizeOption[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => handleFontSizeChange(sz)}
                    className={`filter-tab-chip ${activeFontSize === sz ? 'active' : ''}`}
                    style={{ textTransform: 'capitalize', flex: 1, textAlign: 'center' }}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 8, fontWeight: 500 }}>
                Message Bubble Geometry
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'squircle', label: 'Squircle' },
                  { id: 'pill', label: 'Rounded Pill' },
                  { id: 'sharp', label: 'Crisp Tech' },
                ].map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleBubbleStyleChange(b.id as BubbleStyleOption)}
                    className={`filter-tab-chip ${activeBubbleStyle === b.id ? 'active' : ''}`}
                    style={{ flex: 1, textAlign: 'center', fontSize: '12px' }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 5: AUDIO & TACTILE FEEDBACK
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Volume2 size={14} />
            <span>Audio & Feedback</span>
          </div>

          <div className="settings-card-frame">
            <div className="settings-row-tile">
              <div>
                <div style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 500 }}>
                  Acoustic Audio Ticks
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                  Subtle Web Audio click sound on send & receive
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleSound}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  background: soundEnabled ? 'var(--accent-main)' : 'rgba(255,255,255,0.08)',
                  color: soundEnabled ? '#05080d' : 'var(--text-muted)',
                  fontSize: '12px',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {soundEnabled ? 'ENABLED' : 'MUTED'}
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 6: LANGUAGE / ভাষা
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Globe size={14} />
            <span>Language & Localization</span>
          </div>

          <div className="settings-card-frame">
            <div className="settings-row-tile">
              <div>
                <div style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 500 }}>
                  App Interface Language
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                  Select English or বাংলা
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`filter-tab-chip ${currentLang === 'en' ? 'active' : ''}`}
                  onClick={() => handleLanguageToggle('en')}
                  style={{ padding: '5px 12px', fontSize: '12px' }}
                >
                  English
                </button>
                <button
                  type="button"
                  className={`filter-tab-chip ${currentLang === 'bn' ? 'active' : ''}`}
                  onClick={() => handleLanguageToggle('bn')}
                  style={{ padding: '5px 12px', fontSize: '12px' }}
                >
                  বাংলা
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 7: OFFLINE ENCRYPTED CACHE & STORAGE
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <HardDrive size={14} />
            <span>Offline Encrypted Cache</span>
          </div>

          <div className="settings-card-frame">
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {storageStats.messagesCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Messages</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {storageStats.contactsCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Contacts</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '10px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {storageStats.conversationsCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Chats</div>
                </div>
              </div>
            </div>

            <div className="settings-row-tile">
              <div>
                <div style={{ fontSize: '13.5px', color: '#f8fafc', fontWeight: 500 }}>
                  Purge Local Messages Cache
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                  Clears local IndexedDB messages without affecting contacts
                </div>
              </div>

              <button
                type="button"
                onClick={handleClearCacheData}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: '6px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  color: 'var(--rose-danger)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={13} />
                <span>Purge</span>
              </button>
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 8: HARDWARE SECURITY & CRYPTOGRAPHY
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title">
            <Cpu size={14} />
            <span>Hardware Cryptography & Privacy</span>
          </div>

          <div className="settings-card-frame" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Shield size={18} color="var(--accent-light)" />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                ECDSA P-256 Air-Gapped Key
              </span>
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
              Private cryptographic keys are generated with browser WebCrypto hardware primitives and never leave this device. Zero central tracking, zero telemetry logging.
            </div>
          </div>
        </div>

        {/* =========================================================================
            SECTION 9: DANGER ZONE
            ========================================================================= */}
        <div className="settings-section-block">
          <div className="settings-section-title" style={{ color: 'var(--rose-danger)' }}>
            <Trash2 size={14} />
            <span>Danger Zone</span>
          </div>

          <div className="settings-card-frame" style={{ borderColor: 'rgba(244, 63, 94, 0.25)' }}>
            <div
              onClick={onProfileReset}
              className="settings-row-tile"
              style={{
                cursor: 'pointer',
                background: 'rgba(244, 63, 94, 0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <LogOut size={18} color="var(--rose-danger)" />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#fb7185' }}>
                    Log Out & Reset Identity
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: 1 }}>
                    Permanently wipe your cryptographic keypair and identity on this browser
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
