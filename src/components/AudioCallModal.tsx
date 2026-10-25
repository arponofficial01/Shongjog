import React, { useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react';
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
    <div className="wa-call-overlay">
      <div style={{ fontSize: '13px', color: '#8696a0', letterSpacing: '0.5px' }}>
        WhatsApp Voice Call
      </div>

      <div className="wa-call-peer-container">
        <div className="wa-call-avatar-large">
          {session.peerName.charAt(0).toUpperCase()}
        </div>
        <div className="wa-call-peer-name">{session.peerName}</div>
        {session.peerPhone && (
          <div style={{ color: '#8696a0', fontSize: '14px' }}>{session.peerPhone}</div>
        )}

        <div className="wa-call-status-text">
          {session.state === 'calling' && 'Calling...'}
          {session.state === 'ringing' && 'Incoming Call...'}
          {session.state === 'connected' && formatDuration(session.durationSeconds)}
        </div>
      </div>

      <div className="wa-call-controls">
        {isIncomingRinging ? (
          <>
            <button
              type="button"
              className="wa-call-circle-btn end"
              onClick={handleReject}
              title="Decline"
            >
              <PhoneOff size={26} />
            </button>
            <button
              type="button"
              className="wa-call-circle-btn accept"
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
              className={`wa-call-circle-btn mute ${isSpeaker ? 'active' : ''}`}
              onClick={() => setIsSpeaker(!isSpeaker)}
              title="Speaker"
            >
              <Volume2 size={24} />
            </button>

            {session.state === 'connected' && (
              <button
                type="button"
                className={`wa-call-circle-btn mute ${isMuted ? 'active' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
            )}

            <button
              type="button"
              className="wa-call-circle-btn end"
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
