import React, { useState } from 'react';
import {
  X,
  Smartphone,
  Laptop,
  Download,
  CheckCircle2,
  Globe,
  ExternalLink,
  QrCode,
} from 'lucide-react';
import QRCode from 'qrcode';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'android' | 'windows' | 'web'>('android');
  const [apkQrDataUrl, setApkQrDataUrl] = useState<string>('');

  React.useEffect(() => {
    if (isOpen) {
      // Generate QR code pointing to current host /downloads/Shongjog.apk
      const apkUrl = `${window.location.origin}/downloads/Shongjog.apk`;
      QRCode.toDataURL(apkUrl, {
        width: 180,
        margin: 1,
        color: { dark: '#059669', light: '#ffffff' },
      }).then(setApkQrDataUrl).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadApk = () => {
    const a = document.createElement('a');
    a.href = '/downloads/Shongjog.apk';
    a.download = 'Shongjog.apk';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadExe = () => {
    const a = document.createElement('a');
    a.href = '/downloads/Shongjog-Setup.exe';
    a.download = 'Shongjog-Setup.exe';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(5, 8, 15, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.18s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--bg-card, #0f172a)',
          border: '1px solid var(--border-glass-bright, rgba(255, 255, 255, 0.12))',
          borderRadius: '24px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-pure, #f8fafc)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.08))',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
              }}
            >
              <Download size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                Download Shongjog Apps
              </h3>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary, #94a3b8)' }}>
                Official native Android & Windows Desktop editions
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-secondary, #94a3b8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            padding: '12px 24px',
            background: 'rgba(0, 0, 0, 0.15)',
            borderBottom: '1px solid var(--border-glass, rgba(255, 255, 255, 0.06))',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: '12px',
              border: activeTab === 'android' ? '1px solid #10b981' : '1px solid transparent',
              background: activeTab === 'android' ? 'rgba(16, 185, 129, 0.14)' : 'transparent',
              color: activeTab === 'android' ? '#10b981' : 'var(--text-secondary, #94a3b8)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.16s ease',
            }}
          >
            <Smartphone size={16} />
            <span>Android (APK)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('windows')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: '12px',
              border: activeTab === 'windows' ? '1px solid #38bdf8' : '1px solid transparent',
              background: activeTab === 'windows' ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
              color: activeTab === 'windows' ? '#38bdf8' : 'var(--text-secondary, #94a3b8)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.16s ease',
            }}
          >
            <Laptop size={16} />
            <span>Windows Desktop</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('web')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: '12px',
              border: activeTab === 'web' ? '1px solid #a855f7' : '1px solid transparent',
              background: activeTab === 'web' ? 'rgba(168, 85, 247, 0.14)' : 'transparent',
              color: activeTab === 'web' ? '#c084fc' : 'var(--text-secondary, #94a3b8)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all 0.16s ease',
            }}
          >
            <Globe size={16} />
            <span>Web / PWA</span>
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'android' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.22)',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}
                  >
                    <Smartphone size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>Shongjog for Android</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                      Version 1.0.0 • Native APK • Android 7.0+
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadApk}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: '12px',
                    background: '#10b981',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <Download size={16} />
                  <span>Download APK</span>
                </button>
              </div>

              {/* QR Code + Instructions */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                {apkQrDataUrl ? (
                  <img
                    src={apkQrDataUrl}
                    alt="Scan to Download APK"
                    style={{ width: 130, height: 130, borderRadius: 12, border: '4px solid #ffffff' }}
                  />
                ) : (
                  <div style={{ width: 130, height: 130, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <QrCode size={32} color="#10b981" />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-pure)' }}>
                    Scan QR with Phone or Direct Install
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.45 }}>
                    1. Tap <strong>Download APK</strong> or scan the QR code above with your mobile camera.
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.45 }}>
                    2. Tap the downloaded file and choose <strong>Install</strong>.
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.45 }}>
                    3. Enjoy native HD voice/video calls, offline mesh pairing, and background push notifications!
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'windows' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.22)',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}
                  >
                    <Laptop size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>Shongjog Desktop for Windows</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                      Version 1.0.0 • Native Electron App • Windows 10/11 (x64)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleDownloadExe}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 18px',
                      borderRadius: '12px',
                      background: '#0284c7',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <Download size={15} />
                    <span>Download Windows (.exe)</span>
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 600 }}>Windows Native App Capabilities:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={15} color="#38bdf8" />
                    <span>Native Windows framing & tray</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={15} color="#38bdf8" />
                    <span>Global keyboard shortcuts</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={15} color="#38bdf8" />
                    <span>Direct WebRTC Calling & Screenshare</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <CheckCircle2 size={15} color="#38bdf8" />
                    <span>Offline LAN UDP mesh signaling</span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    fontSize: '12px',
                    color: '#38bdf8',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Ready Executable Locations:</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>Installer: Shongjog-Setup.exe</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>Portable: dist-electron\win-unpacked\Shongjog.exe</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'web' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '1px solid rgba(168, 85, 247, 0.22)',
                  borderRadius: '16px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '14px',
                      background: 'linear-gradient(135deg, #a855f7 0%, #7e22ce 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}
                  >
                    <Globe size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>Progressive Web App (PWA)</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                      Works on any browser • Offline Service Worker Cache
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    alert('To install as an app on your computer or phone:\n\n1. In Chrome/Edge, click the Install App icon in the URL bar (or Menu → "Install Shongjog")\n2. It will open as an independent window on your taskbar!');
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 18px',
                    borderRadius: '12px',
                    background: '#9333ea',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(147, 51, 234, 0.35)',
                  }}
                >
                  <ExternalLink size={15} />
                  <span>How to Install</span>
                </button>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '16px',
                  padding: '16px',
                  fontSize: '12.5px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Shongjog is an offline-first PWA backed by IndexedDB and service workers. It installs instantly with zero downloads required on Chrome, Edge, Safari, and Firefox.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
