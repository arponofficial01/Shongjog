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
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [metaDuration, setMetaDuration] = useState<number>(durationSeconds || 1);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;

    async function loadAudio() {
      if (blobKey) {
        try {
          const blob = await getMediaBlob(blobKey);
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            setAudioUrl(objectUrl);
            return;
          }
        } catch (e) {
          console.warn('Failed to load audio blob from IDB', e);
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

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !audioUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn('Real-time voice playback error:', err);
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

  const defaultBars = [
    28, 45, 62, 34, 78, 92, 54, 68, 36, 48, 82, 100, 74, 44, 62, 88, 42, 28, 58, 72, 38, 48, 64, 32
  ];
  const bars = waveform && waveform.length > 0 ? waveform : defaultBars;
  const totalDuration = durationSeconds > 0 ? durationSeconds : metaDuration;
  const progressRatio = totalDuration > 0 ? currentTime / totalDuration : 0;
  const activeBarIndex = Math.floor(progressRatio * bars.length);

  return (
    <div className={`lux-voice-card ${isOutgoing ? 'outgoing' : 'incoming'}`}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (d && !isNaN(d) && isFinite(d)) setMetaDuration(d);
          }}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}

      <button
        type="button"
        className="lux-voice-play"
        onClick={togglePlay}
        title={isPlaying ? 'Pause Voice Note' : 'Play Real Voice Note'}
      >
        {isPlaying ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
      </button>

      <div
        className="lux-voice-bars"
        onClick={(e) => {
          e.stopPropagation();
          if (!audioRef.current || totalDuration <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, clickX / rect.width));
          audioRef.current.currentTime = ratio * totalDuration;
          setCurrentTime(ratio * totalDuration);
        }}
        style={{ cursor: 'pointer' }}
        title="Click to seek"
      >
        {bars.map((height, idx) => (
          <div
            key={idx}
            className={`lux-bar ${idx <= activeBarIndex ? 'active' : ''}`}
            style={{
              height: `${Math.max(20, Math.min(100, height))}%`,
            }}
          />
        ))}
      </div>

      <div className="lux-voice-meta-tags">
        <span className="lux-voice-duration">
          {formatSeconds(isPlaying ? currentTime : (durationSeconds || 0))}
        </span>

        {isPlaying && (
          <button
            type="button"
            className="lux-voice-speed-chip"
            onClick={cycleSpeed}
            title="Change Playback Speed"
          >
            {playbackSpeed}x
          </button>
        )}
      </div>
    </div>
  );
};
