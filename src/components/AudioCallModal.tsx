import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, ShieldCheck, Zap } from 'lucide-react';
import { CallManager } from '../services/call/callManager';
import type { ActiveCallSession } from '../services/call/callManager';
import { t } from '../i18n/translations';

interface AudioCallModalProps {
  session: ActiveCallSession;
  localUserId: string;
}

export const AudioCallModal: React.FC<AudioCallModalProps> = ({ session, localUserId }) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(session.isMuted);

  const callManager = CallManager.getInstance();

  useEffect(() => {
    callManager.onAudioLevel = (level) => {
      setAudioLevel(level);
    };

    return () => {
      callManager.onAudioLevel = undefined;
    };
  }, [callManager]);

  const handleToggleMute = () => {
    const muted = callManager.toggleMute();
    setIsMuted(muted);
  };

  const handleEndCall = () => {
    callManager.endCall(true);
  };

  const handleAccept = () => {
    callManager.acceptIncomingCall(localUserId);
  };

  const handleReject = () => {
    callManager.rejectIncomingCall(localUserId);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isIncomingRinging = session.direction === 'incoming' && session.state === 'ringing';

  return (
    <div className="call-modal-overlay">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          className={`transport-badge ${session.transport}`}
          style={{ fontSize: '12px', padding: '4px 12px', borderRadius: '16px' }}
        >
          <Zap size={14} />
          {session.transport === 'direct_webrtc_lan'
            ? t('transport_direct')
            : t('transport_cloud')}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ShieldCheck size={14} /> E2EE Verified
        </span>
      </div>

      <div className="call-peer-info">
        <div className="call-avatar-large">
          {session.peerName.charAt(0).toUpperCase()}
        </div>
        <div className="call-peer-name">{session.peerName}</div>
        {session.peerPhone && (
          <div style={{ color: '#94a3b8', fontSize: '14px' }}>{session.peerPhone}</div>
        )}

        <div className="call-state-text">
          {session.state === 'calling' && t('outgoingCall')}
          {session.state === 'ringing' && t('incomingCall')}
          {session.state === 'connected' && (
            <span>
              {t('callConnected')} • {formatDuration(session.durationSeconds)}
            </span>
          )}
        </div>

        {session.state === 'connected' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>{t('liveAudioMeter')}</span>
            <div className="call-audio-meter-bar">
              <div
                className="call-audio-meter-fill"
                style={{ width: `${Math.max(5, audioLevel)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="call-controls-row">
        {isIncomingRinging ? (
          <>
            <button
              type="button"
              className="call-round-btn end"
              onClick={handleReject}
              title={t('declineCall')}
            >
              <PhoneOff size={28} />
            </button>
            <button
              type="button"
              className="call-round-btn accept"
              onClick={handleAccept}
              title={t('acceptCall')}
            >
              <Phone size={28} />
            </button>
          </>
        ) : (
          <>
            {session.state === 'connected' && (
              <button
                type="button"
                className={`call-round-btn mute ${isMuted ? 'active' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? t('unmute') : t('mute')}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
            )}

            <button
              type="button"
              className="call-round-btn end"
              onClick={handleEndCall}
              title={t('endCall')}
            >
              <PhoneOff size={28} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
