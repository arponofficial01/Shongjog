// Real-Time Audio Calling Engine
// Supports direct Offline P2P WebRTC calls and Internet WebRTC calls
// Synthesizes ringtones and call tone via Web Audio API (zero asset dependency)
// Includes live audio frequency visualizer and IndexedDB call history logging

import { getDatabase } from '../db/database';
import type { CallLog, TransportType } from '../db/database';
import { WebRTCService } from '../transport/webrtcService';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface ActiveCallSession {
  callId: string;
  peerId: string;
  peerName: string;
  peerPhone?: string;
  direction: 'incoming' | 'outgoing';
  transport: TransportType;
  state: CallState;
  startTime?: number;
  durationSeconds: number;
  isMuted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}

export class CallManager {
  private static instance: CallManager | null = null;
  public currentSession: ActiveCallSession | null = null;

  private audioContext: AudioContext | null = null;
  private ringOscillator: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private timerInterval: any = null;

  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array<ArrayBuffer> | null = null;

  public onSessionChange?: (session: ActiveCallSession | null) => void;
  public onAudioLevel?: (level: number) => void;

  private constructor() {
    this.setupSignalingListener();
  }

  public static getInstance(): CallManager {
    if (!this.instance) {
      this.instance = new CallManager();
    }
    return this.instance;
  }

  private setupSignalingListener() {
    // Listen for call requests across tabs/devices via BroadcastChannel
    try {
      const channel = new BroadcastChannel('offline_mesh_signaling');
      channel.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'call_request') {
          this.handleIncomingCallRequest(msg);
        } else if (msg.type === 'call_response') {
          this.handleCallResponse(msg);
        } else if (msg.type === 'call_end') {
          this.endCall(false);
        }
      });
    } catch (e) {
      console.warn('BroadcastChannel audio calling listener unavailable', e);
    }
  }

  /**
   * Starts an outgoing audio call to a peer
   */
  public async startOutgoingCall(
    localUserId: string,
    localUserName: string,
    peerId: string,
    peerName: string,
    peerPhone?: string,
    transport: TransportType = 'direct_webrtc_lan'
  ): Promise<ActiveCallSession> {
    if (this.currentSession && this.currentSession.state !== 'idle' && this.currentSession.state !== 'ended') {
      throw new Error('A call session is already in progress');
    }

    const rtc = WebRTCService.getInstance(localUserId, peerId);
    let localStream: MediaStream | null = null;

    try {
      localStream = await rtc.attachLocalAudioTrack();
      this.setupAudioAnalysis(localStream);
    } catch (err) {
      console.error('Failed to access microphone', err);
      throw new Error('Microphone access is required for audio calling');
    }

    const session: ActiveCallSession = {
      callId: crypto.randomUUID(),
      peerId,
      peerName,
      peerPhone,
      direction: 'outgoing',
      transport,
      state: 'calling',
      durationSeconds: 0,
      isMuted: false,
      localStream,
      remoteStream: null,
    };

    this.currentSession = session;
    this.notifySessionUpdate();
    this.playDialTone();

    // Setup WebRTC stream handlers
    rtc.onRemoteStream = (remoteStream) => {
      if (this.currentSession) {
        this.currentSession.remoteStream = remoteStream;
        this.currentSession.state = 'connected';
        this.currentSession.startTime = Date.now();
        this.stopRingtone();
        this.startCallTimer();
        this.notifySessionUpdate();

        // Attach remote audio to browser output element
        this.playRemoteAudio(remoteStream);
      }
    };

    // Broadcast call request to recipient
    rtc.sendSignalingMessage({
      type: 'call_request',
      senderId: localUserId,
      senderName: localUserName,
      targetId: peerId,
      payload: {
        callId: session.callId,
        transport,
      },
      timestamp: Date.now(),
    });

    // Create and send WebRTC audio offer
    const offer = await rtc.createOffer(true);
    rtc.sendSignalingMessage({
      type: 'offer',
      senderId: localUserId,
      senderName: localUserName,
      targetId: peerId,
      payload: offer,
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Handles incoming call request
   */
  public handleIncomingCallRequest(msg: any) {
    if (this.currentSession && this.currentSession.state !== 'idle' && this.currentSession.state !== 'ended') {
      // Send busy signal
      return;
    }

    const session: ActiveCallSession = {
      callId: msg.payload?.callId || crypto.randomUUID(),
      peerId: msg.senderId,
      peerName: msg.senderName || 'Peer Contact',
      direction: 'incoming',
      transport: msg.payload?.transport || 'direct_webrtc_lan',
      state: 'ringing',
      durationSeconds: 0,
      isMuted: false,
      localStream: null,
      remoteStream: null,
    };

    this.currentSession = session;
    this.notifySessionUpdate();
    this.playRingtone();
  }

  /**
   * Accepts an incoming call
   */
  public async acceptIncomingCall(localUserId: string): Promise<void> {
    if (!this.currentSession || this.currentSession.state !== 'ringing') return;

    this.stopRingtone();
    const rtc = WebRTCService.getInstance(localUserId, this.currentSession.peerId);

    try {
      const localStream = await rtc.attachLocalAudioTrack();
      this.currentSession.localStream = localStream;
      this.setupAudioAnalysis(localStream);
    } catch (err) {
      console.error('Cannot access microphone', err);
      this.rejectIncomingCall(localUserId);
      return;
    }

    this.currentSession.state = 'connected';
    this.currentSession.startTime = Date.now();
    this.startCallTimer();
    this.notifySessionUpdate();

    rtc.onRemoteStream = (remoteStream) => {
      if (this.currentSession) {
        this.currentSession.remoteStream = remoteStream;
        this.notifySessionUpdate();
        this.playRemoteAudio(remoteStream);
      }
    };

    // Notify caller that call was accepted
    rtc.sendSignalingMessage({
      type: 'call_response',
      senderId: localUserId,
      senderName: 'Local User',
      targetId: this.currentSession.peerId,
      payload: { accepted: true },
      timestamp: Date.now(),
    });
  }

  /**
   * Rejects incoming call
   */
  public rejectIncomingCall(localUserId: string): void {
    if (!this.currentSession) return;
    this.stopRingtone();

    const rtc = WebRTCService.getInstance(localUserId, this.currentSession.peerId);
    rtc.sendSignalingMessage({
      type: 'call_response',
      senderId: localUserId,
      senderName: 'Local User',
      targetId: this.currentSession.peerId,
      payload: { accepted: false },
      timestamp: Date.now(),
    });

    this.logCallRecord('rejected');
    this.resetSession();
  }

  private handleCallResponse(msg: any) {
    if (!this.currentSession || this.currentSession.direction !== 'outgoing') return;

    if (msg.payload?.accepted) {
      this.stopRingtone();
      this.currentSession.state = 'connected';
      this.currentSession.startTime = Date.now();
      this.startCallTimer();
      this.notifySessionUpdate();
    } else {
      this.endCall(true, 'rejected');
    }
  }

  /**
   * Toggles microphone mute
   */
  public toggleMute(): boolean {
    if (!this.currentSession || !this.currentSession.localStream) return false;
    this.currentSession.isMuted = !this.currentSession.isMuted;
    this.currentSession.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.currentSession!.isMuted;
    });
    this.notifySessionUpdate();
    return this.currentSession.isMuted;
  }

  /**
   * Ends active call and records to IndexedDB
   */
  public async endCall(notifyPeer: boolean = true, status: 'completed' | 'missed' | 'rejected' = 'completed'): Promise<void> {
    this.stopRingtone();
    clearInterval(this.timerInterval);

    if (this.currentSession) {
      if (notifyPeer) {
        try {
          const channel = new BroadcastChannel('offline_mesh_signaling');
          channel.postMessage({
            type: 'call_end',
            senderId: this.currentSession.peerId,
            targetId: this.currentSession.peerId,
            timestamp: Date.now(),
          });
        } catch {
          // Continue
        }
      }

      await this.logCallRecord(status);
    }

    this.resetSession();
  }

  private async logCallRecord(status: 'completed' | 'missed' | 'rejected'): Promise<void> {
    if (!this.currentSession) return;
    try {
      const db = await getDatabase();
      const callLog: CallLog = {
        id: this.currentSession.callId,
        peerId: this.currentSession.peerId,
        peerName: this.currentSession.peerName,
        peerPhone: this.currentSession.peerPhone,
        direction: this.currentSession.direction,
        status,
        durationSeconds: this.currentSession.durationSeconds,
        transport: this.currentSession.transport,
        timestamp: this.currentSession.startTime || Date.now(),
      };
      await db.put('callLogs', callLog);
    } catch (err) {
      console.warn('Could not record call log', err);
    }
  }

  private resetSession() {
    if (this.currentSession?.localStream) {
      this.currentSession.localStream.getTracks().forEach((track) => track.stop());
    }
    this.currentSession = null;
    this.notifySessionUpdate();
  }

  private startCallTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.currentSession && this.currentSession.state === 'connected') {
        this.currentSession.durationSeconds += 1;
        this.notifySessionUpdate();
      }
    }, 1000);
  }

  private notifySessionUpdate() {
    if (this.onSessionChange) {
      this.onSessionChange(this.currentSession ? { ...this.currentSession } : null);
    }
  }

  private playRemoteAudio(stream: MediaStream) {
    let audioElement = document.getElementById('remote_audio_player') as HTMLAudioElement;
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = 'remote_audio_player';
      audioElement.autoplay = true;
      document.body.appendChild(audioElement);
    }
    audioElement.srcObject = stream;
    audioElement.play().catch((e) => console.warn('Audio auto-play policy restriction', e));
  }

  // --- Real-time Visualizer Audio Analysis ---
  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      this.analyser = analyser;
      this.dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkLevel = () => {
        if (!this.analyser || !this.dataArray || !this.currentSession) return;
        this.analyser.getByteFrequencyData(this.dataArray);
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
          sum += this.dataArray[i];
        }
        const avg = sum / this.dataArray.length;
        const normalized = Math.min(100, Math.round((avg / 128) * 100));
        if (this.onAudioLevel) this.onAudioLevel(normalized);

        if (this.currentSession.state === 'connected') {
          requestAnimationFrame(checkLevel);
        }
      };

      requestAnimationFrame(checkLevel);
    } catch (err) {
      console.warn('Audio analyser setup error', err);
    }
  }

  // --- Web Audio Synthesized Ringtones ---
  private playRingtone() {
    this.stopRingtone();
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.ringOscillator = this.audioContext.createOscillator();
      this.ringGain = this.audioContext.createGain();

      this.ringOscillator.type = 'sine';
      this.ringOscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);

      this.ringGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
      this.ringOscillator.connect(this.ringGain);
      this.ringGain.connect(this.audioContext.destination);

      this.ringOscillator.start();
    } catch (e) {
      console.warn('Could not play ringtone', e);
    }
  }

  private playDialTone() {
    this.stopRingtone();
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.ringOscillator = this.audioContext.createOscillator();
      this.ringGain = this.audioContext.createGain();

      this.ringOscillator.type = 'sine';
      this.ringOscillator.frequency.setValueAtTime(350, this.audioContext.currentTime);

      this.ringGain.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      this.ringOscillator.connect(this.ringGain);
      this.ringGain.connect(this.audioContext.destination);

      this.ringOscillator.start();
    } catch (e) {
      console.warn('Could not play dial tone', e);
    }
  }

  private stopRingtone() {
    if (this.ringOscillator) {
      try {
        this.ringOscillator.stop();
        this.ringOscillator.disconnect();
      } catch {}
      this.ringOscillator = null;
    }
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
