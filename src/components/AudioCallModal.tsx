import React, { useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2, ShieldCheck } from 'lucide-react';
import { CallManager } from '../services/call/callManager';
import type { ActiveCallSession } from '../services/call/callManager';

interface AudioCallModalProps {
  session: ActiveCallSession;
  localUserId: string;
}

export const AudioCallModal: React.FC<AudioCallModalProps> = ({ session, localUserId }) => {
  const [isMuted, setIsMuted] = useState(session.isMuted);
  const [isSpeaker, setIsSpeaker] = useState(false);

  const callManager = CallManager.getInstance();

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
    <div className="lux-call-overlay">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: '12px',
          fontWeight: 600,
          color: '#34d399',
          letterSpacing: '0.8px',
          textTransform: 'uppercase',
          background: 'rgba(16, 185, 129, 0.1)',
          padding: '6px 16px',
          borderRadius: '9999px',
          border: '1px solid rgba(16, 185, 129, 0.25)',
        }}
      >
        <ShieldCheck size={14} />
        Encrypted Direct Voice Call
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div className="call-avatar-lux">
          {session.peerName.charAt(0).toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, color: '#f8fafc' }}>
          {session.peerName}
        </div>
        {session.peerPhone && (
          <div style={{ color: '#94a3b8', fontSize: '14px', letterSpacing: '0.3px' }}>
            {session.peerPhone}
          </div>
        )}

        <div style={{ fontSize: '15px', color: '#38bdf8', fontWeight: 500 }}>
          {session.state === 'calling' && 'Calling...'}
          {session.state === 'ringing' && 'Incoming Call...'}
          {session.state === 'connected' && (
            <span style={{ color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
              Connected • {formatDuration(session.durationSeconds)}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
        {isIncomingRinging ? (
          <>
            <button
              type="button"
              className="lux-call-btn end"
              onClick={handleReject}
              title="Decline"
            >
              <PhoneOff size={26} />
            </button>
            <button
              type="button"
              className="lux-call-btn accept"
              onClick={handleAccept}
              title="Accept"
            >
              <Phone size={26} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`lux-call-btn mute ${isSpeaker ? 'active' : ''}`}
              onClick={() => setIsSpeaker(!isSpeaker)}
              title="Speakerphone"
            >
              <Volume2 size={24} />
            </button>

            {session.state === 'connected' && (
              <button
                type="button"
                className={`lux-call-btn mute ${isMuted ? 'active' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
            )}

            <button
              type="button"
              className="lux-call-btn end"
              onClick={handleEndCall}
              title="End call"
            >
              <PhoneOff size={26} />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
