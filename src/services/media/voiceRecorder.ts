// Real Voice Message Recording and Playback Service
// Uses native browser MediaRecorder API with audio/webm (Opus codec)
// Extracts real-time audio waveform amplitudes for rich message bubble visualization

import { saveMediaBlob } from '../db/database';

export interface VoiceRecordingResult {
  blobKey: string;
  blob: Blob;
  dataUrl: string;
  durationSeconds: number;
  waveform: number[];
  mimeType: string;
}

export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private startTime: number = 0;
  private durationSeconds: number = 0;
  private timerInterval: any = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private waveformData: number[] = [];

  public onTimerTick?: (seconds: number) => void;
  public onWaveformSample?: (amplitude: number) => void;

  /**
   * Starts recording audio from the user's microphone
   */
  public async startRecording(): Promise<void> {
    this.audioChunks = [];
    this.waveformData = [];
    this.durationSeconds = 0;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Check supported mime types
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else {
        mimeType = '';
      }
    }

    const options = mimeType ? { mimeType } : undefined;
    this.mediaRecorder = new MediaRecorder(stream, options);

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    // Setup Web Audio Analyser for live visual waveform
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const sampleInterval = setInterval(() => {
        if (!this.analyser || !this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
          clearInterval(sampleInterval);
          return;
        }
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = Math.min(100, Math.round((sum / dataArray.length / 128) * 100));
        this.waveformData.push(avg);
        if (this.onWaveformSample) this.onWaveformSample(avg);
      }, 150);
    } catch (e) {
      console.warn('Waveform analysis unavailable', e);
    }

    this.mediaRecorder.start(250); // Collect slice every 250ms
    this.startTime = Date.now();

    this.timerInterval = setInterval(() => {
      this.durationSeconds = Math.round((Date.now() - this.startTime) / 1000);
      if (this.onTimerTick) this.onTimerTick(this.durationSeconds);
    }, 1000);
  }

  /**
   * Stops recording and returns saved blob key + metadata
   */
  public async stopRecording(): Promise<VoiceRecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder was not started'));
        return;
      }

      clearInterval(this.timerInterval);

      this.mediaRecorder.onstop = async () => {
        try {
          const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
          const audioBlob = new Blob(this.audioChunks, { type: mimeType });
          const blobKey = 'voice_' + crypto.randomUUID();

          // Stop all audio tracks
          this.mediaRecorder?.stream.getTracks().forEach((track) => track.stop());
          if (this.audioContext) {
            try {
              await this.audioContext.close();
            } catch {}
          }

          // Persist directly to IndexedDB
          await saveMediaBlob(blobKey, audioBlob, `voice_note_${Date.now()}.webm`);

          // Downsample waveform to standard 24 points for neat UI display
          const normalizedWaveform = this.downsampleWaveform(this.waveformData, 24);

          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            const dataUrl = (reader.result as string) || '';
            resolve({
              blobKey,
              blob: audioBlob,
              dataUrl,
              durationSeconds: Math.max(1, this.durationSeconds),
              waveform: normalizedWaveform,
              mimeType,
            });
          };
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Cancels active recording without saving
   */
  public cancelRecording(): void {
    clearInterval(this.timerInterval);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
    }
    this.audioChunks = [];
    this.waveformData = [];
  }

  private downsampleWaveform(raw: number[], targetCount: number): number[] {
    if (raw.length === 0) {
      return Array(targetCount).fill(30);
    }
    if (raw.length <= targetCount) {
      return raw.concat(Array(targetCount - raw.length).fill(raw[raw.length - 1] || 30));
    }
    const result: number[] = [];
    const step = raw.length / targetCount;
    for (let i = 0; i < targetCount; i++) {
      const start = Math.floor(i * step);
      const end = Math.floor((i + 1) * step);
      let sum = 0;
      let count = 0;
      for (let j = start; j < end && j < raw.length; j++) {
        sum += raw[j];
        count++;
      }
      result.push(count > 0 ? Math.round(sum / count) : 30);
    }
    return result;
  }
}
