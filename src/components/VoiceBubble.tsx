import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
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
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Playback error', e);
      });
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

  const bars = waveform && waveform.length > 0 ? waveform : Array(24).fill(35);
  const progressRatio = durationSeconds > 0 ? currentTime / durationSeconds : 0;
  const activeBarIndex = Math.floor(progressRatio * bars.length);

  return (
    <div className="voice-bubble-player">
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
        />
      )}

      <button
        type="button"
        className="play-pause-btn"
        onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
      </button>

      <div className="waveform-bars">
        {bars.map((height, idx) => (
          <div
            key={idx}
            className={`waveform-bar ${idx <= activeBarIndex ? 'active' : ''}`}
            style={{
              height: `${Math.max(15, Math.min(100, height))}%`,
              backgroundColor: isOutgoing
                ? idx <= activeBarIndex
                  ? '#ffffff'
                  : 'rgba(255, 255, 255, 0.45)'
                : idx <= activeBarIndex
                ? '#10b981'
                : 'rgba(255, 255, 255, 0.2)',
            }}
          />
        ))}
      </div>

      <span style={{ fontSize: '11px', opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
        {formatSeconds(isPlaying ? currentTime : durationSeconds)}
      </span>
    </div>
  );
};
