import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  Video,
  VideoOff,
  Users,
  ChevronDown,
  Maximize2,
  Radio,
} from 'lucide-react';
import { CallManager } from '../services/call/callManager';
import type { ActiveCallSession } from '../services/call/callManager';

interface AudioCallModalProps {
  session: ActiveCallSession;
  localUserId: string;
}

export const AudioCallModal: React.FC<AudioCallModalProps> = ({ session, localUserId }) => {
  const [isMuted, setIsMuted] = useState(session.isMuted);
  const [isVideoEnabled, setIsVideoEnabled] = useState(session.isVideoEnabled ?? session.callType === 'video');
  const [isSpeaker, setIsSpeaker] = useState(session.isSpeaker ?? true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const callManager = CallManager.getInstance();

  useEffect(() => {
    if (session.remoteStream) {
      if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== session.remoteStream) {
        remoteAudioRef.current.srcObject = session.remoteStream;
        remoteAudioRef.current.muted = false;
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.play().catch(() => {});
      }
      callManager.playRemoteAudio(session.remoteStream);
    }

    const unlockAudio = () => {
      callManager.resumeAudioContext();
      if (remoteAudioRef.current && session.remoteStream) {
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [session.remoteStream]);

  useEffect(() => {
    callManager.onAudioLevel = (level) => {
      setAudioLevel(level);
    };
    return () => {
      callManager.onAudioLevel = undefined;
    };
  }, []);

  const handleToggleMute = () => {
    const muted = callManager.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleVideo = () => {
    const enabled = callManager.toggleVideo();
    setIsVideoEnabled(enabled);
  };

  const handleToggleSpeaker = () => {
    const speaker = callManager.toggleSpeaker();
    setIsSpeaker(speaker);
  };

  const handleEndCall = () => {
    callManager.endCall(true);
  };

  const handleAccept = () => {
    callManager.resumeAudioContext();
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
  const isVideo = session.callType === 'video';

  // Minimized Floating Pill (Allows chatting while continuing call)
  if (isMinimized && !isIncomingRinging) {
    return (
      <div
        className="lux-call-minimized-pill"
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          top: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 14px',
          borderRadius: 9999,
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55), 0 0 16px rgba(16, 185, 129, 0.2)',
          cursor: 'pointer',
          animation: 'fadeIn 0.2s ease',
        }}
        title="Click to expand call"
      >
        <div style={{ position: 'relative', width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
          {session.peerAvatar ? (
            <img src={session.peerAvatar} alt={session.peerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff', fontSize: '13px', fontWeight: 700 }}>
              {session.peerName.charAt(0).toUpperCase()}
            </div>
          )}
          <span
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: session.state === 'connected' ? '#10b981' : '#38bdf8',
              border: '1.5px solid #0f172a',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#f8fafc', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {session.peerName}
          </span>
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {session.state === 'connected' ? formatDuration(session.durationSeconds) : 'Connecting...'}
          </span>
        </div>

        {/* Dynamic Voice Bars in Minimized Mode */}
        {session.state === 'connected' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 16, margin: '0 4px' }}>
            {[0.4, 0.9, 0.6].map((mul, i) => (
              <span
                key={i}
                style={{
                  width: 2.5,
                  height: `${Math.max(4, Math.min(14, 4 + (audioLevel > 0.05 ? audioLevel * 14 * mul : 2)))}px`,
                  borderRadius: 9999,
                  backgroundColor: isMuted ? '#ef4444' : '#10b981',
                  transition: 'height 0.08s ease',
                }}
              />
            ))}
          </div>
        )}

        {/* Quick Controls in Minimized Mode */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={handleToggleMute}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: isMuted ? 'rgba(239, 68, 68, 0.25)' : 'rgba(255, 255, 255, 0.1)',
              color: isMuted ? '#ef4444' : '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>
          <button
            type="button"
            onClick={handleEndCall}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: '#ef4444',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="End Call"
          >
            <PhoneOff size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsMinimized(false)}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
            title="Expand Full Screen"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`lux-call-overlay ${isVideo ? 'video-mode' : ''}`}>
      {/* Top Header Bar with Minimize & Security Badge */}
      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 20,
        }}
      >
        {!isIncomingRinging ? (
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              width: 38,
              height: 38,
              borderRadius: '50%',
              color: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.16s ease',
            }}
            title="Minimize call"
          >
            <ChevronDown size={20} />
          </button>
        ) : (
          <div style={{ width: 38 }} />
        )}

        {/* Security Capsule */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#34d399',
            letterSpacing: '0.6px',
            textTransform: 'uppercase',
            background: 'rgba(16, 185, 129, 0.12)',
            padding: '7px 16px',
            borderRadius: '9999px',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            boxShadow: '0 4px 18px rgba(16, 185, 129, 0.15)',
          }}
        >
          <ShieldCheck size={14} />
          <span>
            {session.isGroup
              ? isVideo
                ? 'Encrypted Group Video Call'
                : 'Encrypted Group Voice Call'
              : isVideo
              ? 'Encrypted Video Call'
              : 'End-to-End Encrypted HD Voice'}
          </span>
        </div>

        {/* Transport Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '11px',
            color: '#94a3b8',
            fontWeight: 600,
          }}
        >
          <Radio size={13} color="#34d399" />
          <span>P2P Direct</span>
        </div>
      </div>

      {/* Direct Hardware Audio Player for Voice Output */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
      />

      {/* Video Call Full-Stage View */}
      {isVideo && session.state === 'connected' ? (
        <div
          className="call-video-stage"
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            maxHeight: '68vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 24,
            overflow: 'hidden',
            background: '#000000',
            margin: '14px 0',
          }}
        >
          {session.remoteStream ? (
            <video
              ref={(el) => {
                remoteVideoRef.current = el;
                if (el && session.remoteStream && el.srcObject !== session.remoteStream) {
                  el.srcObject = session.remoteStream;
                  el.muted = false;
                  el.volume = 1.0;
                  el.play().catch(() => {});
                }
              }}
              autoPlay
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-secondary)' }}>
              <div className="call-avatar-lux" style={{ width: 88, height: 88, fontSize: '32px' }}>
                {session.peerName.charAt(0).toUpperCase()}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Connecting video feed...</div>
            </div>
          )}

          {/* Local PiP Preview Box */}
          {session.localStream && isVideoEnabled && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                right: 16,
                width: 140,
                height: 190,
                borderRadius: 16,
                overflow: 'hidden',
                border: '2px solid rgba(255, 255, 255, 0.25)',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.75)',
                background: '#090d16',
                zIndex: 20,
              }}
            >
              <video
                ref={(el) => {
                  localVideoRef.current = el;
                  if (el && session.localStream && el.srcObject !== session.localStream) {
                    el.srcObject = session.localStream;
                    el.play().catch(() => {});
                  }
                }}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
          )}
        </div>
      ) : (
        /* Center Peer Profile & Ripple Stage for Audio or Ringing Video */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, zIndex: 10 }}>
          <div className="call-avatar-stage">
            <div
              className="call-ripple-ring ring-1"
              style={{
                transform: `scale(${1 + audioLevel * 0.35})`,
                opacity: 0.3 + audioLevel * 0.7,
                transition: 'transform 0.08s ease, opacity 0.08s ease',
              }}
            />
            <div
              className="call-ripple-ring ring-2"
              style={{
                transform: `scale(${1.2 + audioLevel * 0.5})`,
                opacity: 0.2 + audioLevel * 0.6,
                transition: 'transform 0.08s ease, opacity 0.08s ease',
              }}
            />
            <div
              className="call-ripple-ring ring-3"
              style={{
                transform: `scale(${1.4 + audioLevel * 0.6})`,
                opacity: 0.1 + audioLevel * 0.5,
                transition: 'transform 0.08s ease, opacity 0.08s ease',
              }}
            />
            <div className="call-avatar-lux" style={{ overflow: 'hidden' }}>
              {session.peerAvatar ? (
                <img src={session.peerAvatar} alt={session.peerName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : session.isGroup ? (
                <Users size={36} color="#ffffff" />
              ) : (
                session.peerName.charAt(0).toUpperCase()
              )}
            </div>
          </div>

          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 800, color: 'var(--text-pure)', marginBottom: 4 }}>
              {session.peerName}
            </div>
            {session.isGroup ? (
              <div style={{ color: 'var(--accent-light, #10b981)', fontSize: '14px', fontWeight: 600 }}>
                Group Call • {session.groupMemberCount || 0} participants
              </div>
            ) : session.peerPhone ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '14.5px', letterSpacing: '0.4px', fontWeight: 500 }}>
                {session.peerPhone}
              </div>
            ) : null}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
              {session.state === 'calling' && (
                <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pulse-beacon-dot" style={{ backgroundColor: '#38bdf8', boxShadow: '0 0 10px #38bdf8' }} />
                  {isVideo ? 'Calling with Video...' : 'Calling...'}
                </span>
              )}
              {session.state === 'ringing' && (
                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pulse-beacon-dot" style={{ backgroundColor: '#fbbf24', boxShadow: '0 0 10px #fbbf24' }} />
                  {isVideo ? 'Incoming Video Call...' : 'Incoming Voice Call...'}
                </span>
              )}
              {session.state === 'connecting' && (
                <span style={{ color: '#a78bfa', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pulse-beacon-dot" style={{ backgroundColor: '#a78bfa', boxShadow: '0 0 10px #a78bfa' }} />
                  Establishing direct audio channel...
                </span>
              )}
              {session.state === 'connected' && (
                <span style={{ color: '#34d399', fontVariantNumeric: 'tabular-nums', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="pulse-beacon-dot" style={{ backgroundColor: '#34d399', boxShadow: '0 0 10px #34d399' }} />
                  Connected • {formatDuration(session.durationSeconds)}
                </span>
              )}
            </div>

            {/* Live 5-Bar Audio Equalizer Activity */}
            {session.state === 'connected' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3.5, height: 24, marginTop: 2 }}>
                {[0.4, 0.8, 1.0, 0.7, 0.5].map((multiplier, i) => {
                  const barHeight = Math.max(5, Math.min(22, 5 + (audioLevel > 0.05 ? audioLevel * 24 * multiplier : 3)));
                  return (
                    <span
                      key={i}
                      style={{
                        width: 3.5,
                        height: `${barHeight}px`,
                        borderRadius: 9999,
                        backgroundColor: isMuted ? '#ef4444' : 'var(--accent-main, #10b981)',
                        boxShadow: isMuted ? '0 0 6px rgba(239, 68, 68, 0.4)' : '0 0 8px rgba(16, 185, 129, 0.45)',
                        transition: 'height 0.08s ease, background-color 0.2s ease',
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Controls Cluster with Ergonomic Spacing & Labels */}
      <div className="lux-call-controls-cluster" style={{ zIndex: 10 }}>
        {isIncomingRinging ? (
          <>
            <div className="lux-call-action-col">
              <button
                type="button"
                className="lux-call-btn end"
                onClick={handleReject}
                title="Decline Call"
              >
                <PhoneOff size={28} />
              </button>
              <span className="lux-call-action-label">Decline</span>
            </div>

            <div className="lux-call-action-col">
              <button
                type="button"
                className="lux-call-btn accept"
                onClick={handleAccept}
                title="Accept Call"
              >
                {isVideo ? <Video size={28} /> : <Phone size={28} />}
              </button>
              <span className="lux-call-action-label" style={{ color: '#34d399' }}>Accept</span>
            </div>
          </>
        ) : (
          <>
            {isVideo && (
              <div className="lux-call-action-col">
                <button
                  type="button"
                  className={`lux-call-btn speaker ${isVideoEnabled ? 'active' : ''}`}
                  onClick={handleToggleVideo}
                  title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
                >
                  {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                </button>
                <span className="lux-call-action-label">{isVideoEnabled ? 'Camera' : 'Off'}</span>
              </div>
            )}

            <div className="lux-call-action-col">
              <button
                type="button"
                className={`lux-call-btn speaker ${isSpeaker ? 'active' : ''}`}
                onClick={handleToggleSpeaker}
                title="Speakerphone"
              >
                {isSpeaker ? <Volume2 size={24} /> : <VolumeX size={24} />}
              </button>
              <span className="lux-call-action-label">Speaker</span>
            </div>

            <div className="lux-call-action-col">
              <button
                type="button"
                className={`lux-call-btn mute ${isMuted ? 'active' : ''}`}
                onClick={handleToggleMute}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>
              <span className="lux-call-action-label">{isMuted ? 'Unmute' : 'Mute'}</span>
            </div>

            <div className="lux-call-action-col">
              <button
                type="button"
                className="lux-call-btn end"
                onClick={handleEndCall}
                title="End Call"
              >
                <PhoneOff size={28} />
              </button>
              <span className="lux-call-action-label" style={{ color: '#f87171' }}>End Call</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AudioCallModal;
