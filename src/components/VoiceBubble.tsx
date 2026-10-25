import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Mic, User } from 'lucide-react';
import { getMediaBlob } from '../services/db/database';

interface VoiceBubbleProps {
  blobKey?: string;
  mediaUrl?: string;
  durationSeconds?: number;
  waveform?: number[];
  isOutgoing?: boolean;
}

export const VoiceBubble: React.FC<VoiceBubbleProps> = ({
  blobKey,
  mediaUrl,
  durationSeconds = 0,
  waveform = [],
  isOutgoing = false,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    async function loadAudio() {
      if (blobKey) {
        const blob = await getMediaBlob(blobKey);
        if (blob) {
          objectUrl = URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
          return;
        }
      }
      if (mediaUrl) {
        setAudioUrl(mediaUrl);
      }
    }

    loadAudio();

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [blobKey, mediaUrl]);

  const togglePlay = () => {
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Voice playback failed', e);
      });
    }
  };

  const cycleSpeed = (e: React.MouseEvent) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIndex = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIndex];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s < 10 ? '0' : ''}${s}`;
  };

  const bars = waveform && waveform.length > 0 ? waveform : [
    25, 45, 60, 30, 75, 90, 50, 65, 30, 45, 80, 100, 70, 40, 60, 85, 40, 25, 55, 70, 35, 45, 60, 30
  ];
  const progressRatio = durationSeconds > 0 ? currentTime / durationSeconds : 0;
  const activeBarIndex = Math.floor(progressRatio * bars.length);

  return (
    <div className="wa-voice-message">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />
      )}

      {/* WhatsApp Voice Avatar with Green Mic Badge */}
      <div className="wa-voice-avatar-circle">
        <User size={22} color="#8696a0" />
        <div className="wa-voice-mic-badge">
          <Mic size={10} color="white" />
        </div>
      </div>

      <button
        type="button"
        className="wa-voice-play-btn"
        onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
      </button>

      {/* WhatsApp Waveform Slider */}
      <div className="wa-voice-waveform-container">
        {bars.map((height, idx) => (
          <div
            key={idx}
            className={`wa-voice-bar ${idx <= activeBarIndex ? 'active' : ''}`}
            style={{
              height: `${Math.max(15, Math.min(100, height))}%`,
              backgroundColor: idx <= activeBarIndex
                ? '#53bdeb'
                : isOutgoing
                ? 'rgba(255, 255, 255, 0.4)'
                : 'rgba(134, 150, 160, 0.5)',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span style={{ fontSize: '11px', color: '#8696a0', fontVariantNumeric: 'tabular-nums' }}>
          {formatSeconds(isPlaying ? currentTime : durationSeconds)}
        </span>

        {isPlaying && (
          <button
            type="button"
            onClick={cycleSpeed}
            style={{
              fontSize: '10px',
              fontWeight: 700,
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              padding: '1px 4px',
              borderRadius: '8px',
              color: '#e9edef',
            }}
          >
            {playbackSpeed}x
          </button>
        )}
      </div>
    </div>
  );
};
