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

  const [storageStats, setStorageStats] = useState({ messagesCount: 0, contactsCount: 0 });

  useEffect(() => {
    async function loadStats() {
      try {
        const db = await getDatabase();
        const mCount = await db.count('messages');
        const cCount = await db.count('contacts');
        setStorageStats({ messagesCount: mCount, contactsCount: cCount });
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

  const themes: { id: ThemeOption; name: string; color: string; bg: string }[] = [
    { id: 'emerald', name: 'Emerald', color: '#10b981', bg: 'linear-gradient(135deg, #10b981, #059669)' },
    { id: 'sapphire', name: 'Sapphire', color: '#0284c7', bg: 'linear-gradient(135deg, #38bdf8, #0284c7)' },
    { id: 'amethyst', name: 'Amethyst', color: '#8b5cf6', bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
    { id: 'gold', name: 'Imperial Gold', color: '#eab308', bg: 'linear-gradient(135deg, #fde047, #ca8a04)' },
    { id: 'ruby', name: 'Crimson Ruby', color: '#f43f5e', bg: 'linear-gradient(135deg, #fb7185, #e11d48)' },
  ];

  return (
    <div className="luxury-drawer-shell">
      <div className="drawer-gradient-bar">
        <button type="button" onClick={onBack} style={{ color: 'white' }}>
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700 }}>Settings & Customization</h2>
      </div>

      <div className="drawer-scroll-container" style={{ padding: '0 0 40px 0' }}>
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
              width: 72,
              height: 72,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--brand-orb-grad)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontFamily: 'var(--font-display)',
              fontSize: '28px',
              fontWeight: 700,
              boxShadow: '0 8px 24px var(--accent-glow)',
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
              {profile.phoneNumber}
            </div>
          </div>
        </div>

        {/* 1. THEME CUSTOMIZATION (A to Z Color Schemes) */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Palette size={19} color="var(--accent-light)" />
            <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#f8fafc' }}>Luxury Color Themes</span>
          </div>

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
                    padding: '8px 4px',
                    borderRadius: '10px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
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
                  <span style={{ fontSize: '11px', color: isSelected ? '#ffffff' : '#94a3b8' }}>{th.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. CHAT WALLPAPER & AMBIENT STYLE */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Sparkles size={19} color="#38bdf8" />
            <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#f8fafc' }}>Ambient Background Wallpaper</span>
          </div>

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
                    padding: '9px 12px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    border: isSelected ? '1px solid var(--accent-light)' : '1px solid var(--border-glass)',
                    color: isSelected ? 'white' : 'var(--text-secondary)',
                    fontSize: '12.5px',
                    fontWeight: 500,
                  }}
                >
                  {wp.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. CHAT FONT SCALE & BUBBLE STYLES */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Type size={19} color="#a78bfa" />
            <span style={{ fontSize: '14.5px', fontWeight: 600, color: '#f8fafc' }}>Text Size & Bubble Curvature</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 6 }}>Font Size</div>
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
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 6 }}>Bubble Corners</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'squircle', label: 'Modern Squircle' },
                { id: 'pill', label: 'Rounded Pill' },
                { id: 'sharp', label: 'Crisp Tech' },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleBubbleStyleChange(b.id as BubbleStyleOption)}
                  className={`filter-tab-chip ${activeBubbleStyle === b.id ? 'active' : ''}`}
                  style={{ flex: 1, textAlign: 'center', fontSize: '11.5px' }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. LANGUAGE / ভাষা */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid var(--border-glass)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Globe size={19} color="#06b6d4" />
            <div>
              <div style={{ fontSize: '14.5px', color: '#f8fafc' }}>Language / ভাষা</div>
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

        {/* 5. SOUND EFFECTS */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px',
            borderBottom: '1px solid var(--border-glass)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Volume2 size={19} color="#eab308" />
            <div>
              <div style={{ fontSize: '14.5px', color: '#f8fafc' }}>Acoustic Audio Ticks</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Web Audio click on send & receive</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleSound}
            style={{
              padding: '5px 12px',
              borderRadius: '20px',
              background: soundEnabled ? 'var(--accent-main)' : 'rgba(255,255,255,0.06)',
              color: soundEnabled ? 'white' : 'var(--text-muted)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* 6. STORAGE & ENCRYPTED CACHE */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
            <HardDrive size={19} color="#fbbf24" />
            <div style={{ fontSize: '14.5px', color: '#f8fafc' }}>Offline IndexedDB Cache</div>
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
            • {storageStats.messagesCount} Encrypted Messages Persisted<br />
            • {storageStats.contactsCount} Local Mesh Directory Contacts
          </div>
        </div>

        {/* 7. HARDWARE ECDSA PRIVACY */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <Shield size={19} color="var(--accent-light)" />
            <div style={{ fontSize: '14.5px', color: '#f8fafc' }}>Hardware Security</div>
          </div>
          <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
            ECDSA P-256 private hardware keys stored locally in browser sandbox. Zero unencrypted telemetry.
          </div>
        </div>

        {/* 8. LOG OUT & RESET */}
        <div
          onClick={onProfileReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '20px',
            marginTop: 8,
            cursor: 'pointer',
            color: '#f43f5e',
          }}
        >
          <LogOut size={19} color="#f43f5e" />
          <div style={{ fontSize: '14.5px', fontWeight: 600 }}>Log Out & Reset Local Identity</div>
        </div>
      </div>
    </div>
  );
};
