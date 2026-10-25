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
  ChevronRight,
  Key,
} from 'lucide-react';
import type { UserProfile } from '../services/db/database';
import { getLanguage, setLanguage } from '../i18n/translations';
import type { SupportedLanguage } from '../i18n/translations';
import { getDatabase } from '../services/db/database';

export type ThemeOption = 'emerald' | 'sapphire' | 'amethyst' | 'gold' | 'ruby';
export type WallpaperOption = 'aurora' | 'grid' | 'minimal' | 'stars';
export type FontSizeOption = 'compact' | 'standard' | 'spacious';
export type BubbleStyleOption = 'squircle' | 'pill' | 'sharp';
export type SettingsSubView = 'menu' | 'profile' | 'themes' | 'chat' | 'audio' | 'language' | 'storage' | 'security';

interface SettingsPanelProps {
  profile: UserProfile;
  onBack: () => void;
  onProfileReset: () => void;
  onLanguageChange?: (lang: SupportedLanguage) => void;
  onRequestConfirm: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
    isAlertOnly?: boolean;
    onConfirm: () => void;
  }) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  profile,
  onBack,
  onProfileReset,
  onLanguageChange,
  onRequestConfirm,
}) => {
  const currentLang = getLanguage();
  const [activeView, setActiveView] = useState<SettingsSubView>('menu');

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
  }, [activeView]);

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

  const handlePurgeMessages = () => {
    onRequestConfirm({
      title: 'Purge Local Message Cache?',
      message: 'This will erase all cached offline messages from this device. Your contacts, conversations list, and profile identity will remain completely safe.',
      confirmLabel: 'Purge Cache',
      isDanger: true,
      onConfirm: async () => {
        try {
          const db = await getDatabase();
          await db.clear('messages');
          setStorageStats((prev) => ({ ...prev, messagesCount: 0 }));
          onRequestConfirm({
            title: 'Cache Purged',
            message: 'All local messages have been purged from IndexedDB offline storage.',
            confirmLabel: 'OK',
            isAlertOnly: true,
            onConfirm: () => {},
          });
        } catch (e) {
          console.error('Failed to clear cache', e);
        }
      },
    });
  };

  const handleResetIdentityClick = () => {
    onRequestConfirm({
      title: 'Log Out & Reset Identity?',
      message: 'This will remove your local cryptographic session and keys from this browser. Are you sure you want to proceed?',
      confirmLabel: 'Log Out & Reset',
      isDanger: true,
      onConfirm: () => {
        onProfileReset();
      },
    });
  };

  const themes: { id: ThemeOption; name: string; color: string; bg: string }[] = [
    { id: 'emerald', name: 'Emerald', color: '#10b981', bg: 'linear-gradient(135deg, #10b981, #059669)' },
    { id: 'sapphire', name: 'Sapphire', color: '#0284c7', bg: 'linear-gradient(135deg, #38bdf8, #0284c7)' },
    { id: 'amethyst', name: 'Amethyst', color: '#8b5cf6', bg: 'linear-gradient(135deg, #a78bfa, #7c3aed)' },
    { id: 'gold', name: 'Gold', color: '#eab308', bg: 'linear-gradient(135deg, #fde047, #ca8a04)' },
    { id: 'ruby', name: 'Ruby', color: '#f43f5e', bg: 'linear-gradient(135deg, #fb7185, #e11d48)' },
  ];

  // Helper titles for views
  const viewTitles: Record<SettingsSubView, string> = {
    menu: 'Settings & Preferences',
    profile: 'Profile & Cryptographic Identity',
    themes: 'Appearance & Themes',
    chat: 'Chat Customization',
    audio: 'Audio & Haptics',
    language: 'Language / ভাষা',
    storage: 'Offline Encrypted Storage',
    security: 'Hardware Cryptography',
  };

  return (
    <div className="luxury-drawer-shell">
      {/* Top Header Bar */}
      <div className="drawer-gradient-bar">
        <button
          type="button"
          onClick={() => {
            if (activeView === 'menu') {
              onBack();
            } else {
              setActiveView('menu');
            }
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: 4,
          }}
          title={activeView === 'menu' ? 'Back to Chats' : 'Back to Settings'}
        >
          <ArrowLeft size={22} />
        </button>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '19px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
          {viewTitles[activeView]}
        </h2>
      </div>

      {/* Main Settings Navigation Menu */}
      {activeView === 'menu' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          {/* Profile Card Tile */}
          <div
            onClick={() => setActiveView('profile')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255, 255, 255, 0.035)',
              border: '1px solid var(--border-glass)',
              cursor: 'pointer',
              marginBottom: '20px',
              transition: 'all 0.2s ease',
            }}
            className="settings-menu-nav-item"
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-orb-grad)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '24px',
                fontWeight: 700,
                boxShadow: '0 8px 24px var(--accent-glow)',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                profile.displayName.charAt(0).toUpperCase()
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: 600, color: '#f8fafc', marginBottom: 2 }}>
                {profile.displayName}
              </div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '12px',
                  color: 'var(--accent-light)',
                  fontWeight: 600,
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  marginBottom: 3,
                }}
              >
                <AtSign size={11} />
                {profile.username}
              </div>
              {profile.bio && (
                <div style={{ fontSize: '12px', color: '#cbd5e1', fontStyle: 'italic', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  "{profile.bio}"
                </div>
              )}
              <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                {profile.phoneNumber || 'P2P Identity Active'}
              </div>
            </div>

            <ChevronRight size={19} color="#64748b" />
          </div>

          {/* Navigation Category 1: Preferences */}
          <div className="settings-section-block">
            <div className="settings-section-title">
              <span>Preferences & Customization</span>
            </div>

            <div className="settings-card-frame">
              {/* Themes */}
              <div
                className="settings-row-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveView('themes')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-light)' }}>
                    <Palette size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                      Themes & Atmosphere
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize' }}>
                      {activeTheme} • {activeWallpaper}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#64748b" />
              </div>

              {/* Chat Customization */}
              <div
                className="settings-row-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveView('chat')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(139, 92, 246, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a78bfa' }}>
                    <Type size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                      Chat & Typography
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'capitalize' }}>
                      {activeFontSize} text • {activeBubbleStyle} bubbles
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#64748b" />
              </div>

              {/* Audio */}
              <div
                className="settings-row-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveView('audio')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(234, 179, 8, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fde047' }}>
                    <Volume2 size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                      Audio & Haptic Ticks
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Acoustic clicks: {soundEnabled ? 'Enabled' : 'Muted'}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#64748b" />
              </div>

              {/* Language */}
              <div
                className="settings-row-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveView('language')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(6, 182, 212, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
                    <Globe size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                      Language / ভাষা
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {currentLang === 'en' ? 'English (US)' : 'বাংলা (Bengali)'}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#64748b" />
              </div>
            </div>
          </div>

          {/* Navigation Category 2: Data & Privacy */}
          <div className="settings-section-block">
            <div className="settings-section-title">
              <span>Security & Local Storage</span>
            </div>

            <div className="settings-card-frame">
              {/* Storage */}
              <div
                className="settings-row-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveView('storage')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(249, 115, 22, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb923c' }}>
                    <HardDrive size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                      Offline Encrypted Storage
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      {storageStats.messagesCount} cached messages • {storageStats.contactsCount} contacts
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#64748b" />
              </div>

              {/* Security */}
              <div
                className="settings-row-tile"
                style={{ cursor: 'pointer' }}
                onClick={() => setActiveView('security')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-light)' }}>
                    <Cpu size={19} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                      Hardware Cryptography
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      ECDSA P-256 Air-Gapped Keys
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#64748b" />
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="settings-section-block">
            <div className="settings-section-title" style={{ color: 'var(--rose-danger)' }}>
              <span>Danger Zone</span>
            </div>

            <div className="settings-card-frame" style={{ borderColor: 'rgba(244, 63, 94, 0.25)' }}>
              <div
                onClick={handleResetIdentityClick}
                className="settings-row-tile"
                style={{ cursor: 'pointer', background: 'rgba(244, 63, 94, 0.04)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <LogOut size={19} color="var(--rose-danger)" />
                  <div>
                    <div style={{ fontSize: '14.5px', fontWeight: 600, color: '#fb7185' }}>
                      Log Out & Reset Identity
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Wipes local keys and cryptographic session
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 1: PROFILE & IDENTITY */}
      {activeView === 'profile' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-card-frame" style={{ padding: '24px 20px', textAlign: 'center', marginBottom: 18 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 'var(--radius-sm)',
                background: 'var(--brand-orb-grad)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontFamily: 'var(--font-display)',
                fontSize: '32px',
                fontWeight: 700,
                boxShadow: '0 8px 30px var(--accent-glow)',
                margin: '0 auto 14px',
                overflow: 'hidden',
              }}
            >
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                profile.displayName.charAt(0).toUpperCase()
              )}
            </div>

            <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#f8fafc', margin: '0 0 4px 0' }}>
              {profile.displayName}
            </h3>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '13px',
                color: 'var(--accent-light)',
                fontWeight: 600,
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                padding: '3px 10px',
                borderRadius: '8px',
                marginBottom: 8,
              }}
            >
              <AtSign size={13} />
              {profile.username}
            </div>

            {profile.bio && (
              <div
                style={{
                  fontSize: '13px',
                  color: '#e2e8f0',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  margin: '6px 0 10px',
                  fontStyle: 'italic',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                "{profile.bio}"
              </div>
            )}

            <div style={{ fontSize: '13px', color: '#94a3b8' }}>
              {profile.phoneNumber || 'Direct Peer Node'}
            </div>
          </div>

          <div className="settings-section-title">
            <Key size={14} />
            <span>Cryptographic Fingerprint</span>
          </div>
          <div className="settings-card-frame" style={{ padding: '16px 18px' }}>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: 8 }}>
              Hardware Device ID (Sandbox Verified):
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent-light)', wordBreak: 'break-all', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '6px' }}>
              {profile.deviceId || 'SECURE_SANDBOX'}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: THEMES & ATMOSPHERE */}
      {activeView === 'themes' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-section-block">
            <div className="settings-section-title">
              <Palette size={14} />
              <span>Color Themes</span>
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
                    >
                      <div
                        style={{
                          width: 34,
                          height: 34,
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

          <div className="settings-section-block">
            <div className="settings-section-title">
              <Sparkles size={14} />
              <span>Ambient Background Wallpaper</span>
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
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1px solid var(--accent-light)' : '1px solid var(--border-glass)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                        fontSize: '13px',
                        fontWeight: isSelected ? 600 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
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
        </div>
      )}

      {/* SUB-VIEW 3: CHAT & TYPOGRAPHY */}
      {activeView === 'chat' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-section-block">
            <div className="settings-section-title">
              <Type size={14} />
              <span>Chat Font Size</span>
            </div>
            <div className="settings-card-frame" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['compact', 'standard', 'spacious'] as FontSizeOption[]).map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => handleFontSizeChange(sz)}
                    className={`filter-tab-chip ${activeFontSize === sz ? 'active' : ''}`}
                    style={{ textTransform: 'capitalize', flex: 1, textAlign: 'center', padding: '10px' }}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="settings-section-block">
            <div className="settings-section-title">
              <Type size={14} />
              <span>Bubble Curvature</span>
            </div>
            <div className="settings-card-frame" style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: 8 }}>
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
                    style={{ flex: 1, textAlign: 'center', fontSize: '12px', padding: '10px' }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: AUDIO & SOUND */}
      {activeView === 'audio' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-card-frame">
            <div className="settings-row-tile">
              <div>
                <div style={{ fontSize: '14.5px', color: '#f8fafc', fontWeight: 500 }}>
                  Acoustic Audio Ticks
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: 2 }}>
                  Web Audio click on message dispatch & receipt
                </div>
              </div>

              <button
                type="button"
                onClick={handleToggleSound}
                style={{
                  padding: '7px 16px',
                  borderRadius: '20px',
                  background: soundEnabled ? 'var(--accent-main)' : 'rgba(255,255,255,0.08)',
                  color: soundEnabled ? '#05080d' : 'var(--text-muted)',
                  fontSize: '12.5px',
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
      )}

      {/* SUB-VIEW 5: LANGUAGE */}
      {activeView === 'language' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-card-frame">
            <div
              className="settings-row-tile"
              style={{ cursor: 'pointer' }}
              onClick={() => handleLanguageToggle('en')}
            >
              <div>
                <div style={{ fontSize: '15px', color: '#f8fafc', fontWeight: 500 }}>
                  English (United States)
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Default system language</div>
              </div>
              {currentLang === 'en' && <Check size={18} color="var(--accent-light)" />}
            </div>

            <div
              className="settings-row-tile"
              style={{ cursor: 'pointer' }}
              onClick={() => handleLanguageToggle('bn')}
            >
              <div>
                <div style={{ fontSize: '15px', color: '#f8fafc', fontWeight: 500 }}>
                  বাংলা (Bengali)
                </div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>বাংলাদেশ সরকারি ভাষা</div>
              </div>
              {currentLang === 'bn' && <Check size={18} color="var(--accent-light)" />}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 6: STORAGE */}
      {activeView === 'storage' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-card-frame" style={{ marginBottom: 18 }}>
            <div style={{ padding: '18px', borderBottom: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, textAlign: 'center' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {storageStats.messagesCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Messages</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {storageStats.contactsCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Contacts</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px 8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent-light)' }}>
                    {storageStats.conversationsCount}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 2 }}>Chats</div>
                </div>
              </div>
            </div>

            <div className="settings-row-tile">
              <div>
                <div style={{ fontSize: '14px', color: '#f8fafc', fontWeight: 500 }}>
                  Purge Local Messages Cache
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                  Clears local messages while retaining contacts
                </div>
              </div>

              <button
                type="button"
                onClick={handlePurgeMessages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: '6px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.25)',
                  color: 'var(--rose-danger)',
                  fontSize: '12.5px',
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
      )}

      {/* SUB-VIEW 7: HARDWARE SECURITY */}
      {activeView === 'security' && (
        <div className="drawer-scroll-container" style={{ padding: '20px 18px 48px' }}>
          <div className="settings-card-frame" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Shield size={20} color="var(--accent-light)" />
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                Hardware Cryptographic Sandbox
              </span>
            </div>
            <div style={{ fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.6 }}>
              ECDSA P-256 keys generated via W3C WebCrypto API. Private keys are non-exportable and never touch any cloud or relay server. All communication carries end-to-end cryptographic signatures.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
