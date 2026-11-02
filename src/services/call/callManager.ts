// Real-Time Audio Calling Engine
// Supports direct Offline P2P WebRTC calls, Local LAN zero-internet calls, and Internet WebRTC calls
// Synthesizes authentic ringtones, ringback tones, and busy signals via Web Audio API
// Live audio frequency visualizer mapped to actual incoming voice stream
// Full persistent call history logging to IndexedDB

import { getDatabase } from '../db/database';
import type { CallLog, TransportType, Message } from '../db/database';
import { WebRTCService } from '../transport/webrtcService';
import { TransportManager } from '../transport/transportManager';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export interface ActiveCallSession {
  callId: string;
  peerId: string;
  peerName: string;
  peerPhone?: string;
  peerAvatar?: string;
  direction: 'incoming' | 'outgoing';
  transport: TransportType;
  state: CallState;
  startTime?: number;
  durationSeconds: number;
  isMuted: boolean;
  isVideoEnabled?: boolean;
  isSpeaker?: boolean;
  callType: 'audio' | 'video';
  isGroup?: boolean;
  groupMemberCount?: number;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  localUserId?: string;
}

export class CallManager {
  private static instance: CallManager | null = null;
  public currentSession: ActiveCallSession | null = null;

  private audioContext: AudioContext | null = null;
  private cadenceInterval: any = null;
  private activeOscillators: OscillatorNode[] = [];
  private timerInterval: any = null;
  private unansweredTimeout: any = null;
  private ringingTimeout: any = null;
  private connectionWatchdog: any = null;

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

  public currentUserId: string | null = null;
  private processedCallSignals: Set<string> = new Set();

  public getLocalUserId(): string | null {
    if (this.currentUserId) return this.currentUserId;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('contact_app_active_user_id') || localStorage.getItem('shongjog_active_user_id');
    }
    return null;
  }

  public setLocalUserId(id: string) {
    this.currentUserId = id;
  }

  private setupSignalingListener() {
    // Listen for call requests across tabs/devices via BroadcastChannel
    try {
      const channel = new BroadcastChannel('offline_mesh_signaling');
      channel.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg) return;

        const myId = this.getLocalUserId();

        // Ignore messages sent by ourselves
        if (myId && msg.senderId === myId) return;

        // If message has a targetId and it's not a group call, ensure it's addressed to us
        if (myId && msg.targetId && msg.targetId !== myId && !msg.payload?.isGroup) {
          return;
        }

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
   * Starts an outgoing audio or video call to a peer or group
   */
  public async startOutgoingCall(
    localUserId: string,
    localUserName: string,
    peerId: string,
    peerName: string,
    peerPhone?: string,
    transport: TransportType = 'direct_webrtc_lan',
    callType: 'audio' | 'video' = 'audio',
    isGroup: boolean = false,
    groupMemberCount: number = 0,
    peerAvatar?: string
  ): Promise<ActiveCallSession> {
    if (this.currentSession && this.currentSession.state !== 'idle' && this.currentSession.state !== 'ended') {
      throw new Error('A call session is already in progress');
    }

    this.currentUserId = localUserId;

    // Reset previous connection state for this peer pair
    WebRTCService.resetInstance(localUserId, peerId);
    const rtc = WebRTCService.getInstance(localUserId, peerId);
    let localStream: MediaStream | null = null;

    try {
      localStream = await rtc.attachLocalMediaTrack(callType === 'video');
      this.setupAudioAnalysis(localStream);
    } catch (err) {
      if (callType === 'video') {
        try {
          localStream = await rtc.attachLocalMediaTrack(false);
          this.setupAudioAnalysis(localStream);
          callType = 'audio';
        } catch (audioErr) {
          console.error('Failed to access microphone', audioErr);
          throw new Error('Microphone access is required for calling');
        }
      } else {
        console.error('Failed to access media devices', err);
        throw new Error('Microphone or camera access is required for calling');
      }
    }

    const session: ActiveCallSession = {
      callId: crypto.randomUUID(),
      peerId,
      peerName,
      peerPhone,
      peerAvatar,
      direction: 'outgoing',
      transport,
      state: 'calling',
      callType,
      isGroup,
      groupMemberCount,
      durationSeconds: 0,
      isMuted: false,
      isVideoEnabled: callType === 'video',
      isSpeaker: true,
      localStream,
      remoteStream: null,
      localUserId,
    };

    this.currentSession = session;
    this.notifySessionUpdate();
    this.playDialTone();

    // 35-Second unanswered call timeout
    clearTimeout(this.unansweredTimeout);
    this.unansweredTimeout = setTimeout(() => {
      if (this.currentSession && this.currentSession.state === 'calling') {
        console.log('[CallManager] Outgoing call timed out (no answer)');
        this.playBusyTone();
        setTimeout(() => this.endCall(true, 'missed'), 2000);
      }
    }, 35000);

    // Setup WebRTC stream handlers
    rtc.onRemoteStream = (remoteStream) => {
      console.log('[CallManager] Remote stream connected from peer!');
      if (this.currentSession) {
        this.currentSession.remoteStream = remoteStream;
        this.currentSession.state = 'connected';
        if (!this.currentSession.startTime) {
          this.currentSession.startTime = Date.now();
        }
        this.stopRingtone();
        clearTimeout(this.connectionWatchdog);
        this.startCallTimer();
        this.notifySessionUpdate();

        // Switch frequency analyzer to remote voice stream
        this.setupAudioAnalysis(remoteStream);
        // Play remote audio through dedicated player
        this.playRemoteAudio(remoteStream);
      }
    };

    rtc.onStateChange = (state) => {
      console.log('[CallManager] WebRTC connection state changed:', state);
      if (state === 'connected' && this.currentSession) {
        this.stopRingtone();
        clearTimeout(this.connectionWatchdog);
        if (this.currentSession.state !== 'connected') {
          this.currentSession.state = 'connected';
          if (!this.currentSession.startTime) {
            this.currentSession.startTime = Date.now();
          }
          this.startCallTimer();
          this.notifySessionUpdate();
        }
      } else if ((state === 'failed' || state === 'closed') && this.currentSession && this.currentSession.state === 'connecting') {
        console.warn('[CallManager] Direct peer connection failed');
        this.playBusyTone();
        setTimeout(() => this.endCall(false, 'missed'), 1800);
      }
    };

    // Broadcast call request to recipient across all transports
    rtc.sendSignalingMessage({
      type: 'call_request',
      senderId: localUserId,
      senderName: localUserName,
      targetId: peerId,
      payload: {
        callId: session.callId,
        transport,
        callType,
        isGroup,
        groupMemberCount,
        peerAvatar,
      },
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Handles incoming call request
   */
  public async handleIncomingCallRequest(msg: any) {
    if (!msg || !msg.senderId) return;

    // Deduplicate incoming call request across multiple transport channels
    const reqKey = `req_${msg.senderId}_${msg.payload?.callId || msg.timestamp}`;
    if (this.processedCallSignals.has(reqKey)) return;
    this.processedCallSignals.add(reqKey);
    setTimeout(() => this.processedCallSignals.delete(reqKey), 10000);

    if (this.currentSession && this.currentSession.state !== 'idle' && this.currentSession.state !== 'ended') {
      // Send busy signal back to caller
      try {
        const rtc = WebRTCService.getInstance(msg.targetId, msg.senderId);
        rtc.sendSignalingMessage({
          type: 'call_response',
          senderId: msg.targetId,
          senderName: 'Contact',
          targetId: msg.senderId,
          payload: { accepted: false, reason: 'busy' },
          timestamp: Date.now(),
        });
      } catch {}
      return;
    }

    // Check if peer is blocked or restricted
    try {
      const db = await getDatabase();
      const contact = await db.get('contacts', msg.senderId);
      if (contact && (contact.isBlocked || contact.isRestricted)) {
        // Silently decline call from blocked/restricted contact
        const rtc = WebRTCService.getInstance(msg.targetId, msg.senderId);
        rtc.sendSignalingMessage({
          type: 'call_response',
          senderId: msg.targetId,
          senderName: 'Contact',
          targetId: msg.senderId,
          payload: { accepted: false, reason: 'declined' },
          timestamp: Date.now(),
        });
        return;
      }
    } catch {}

    const session: ActiveCallSession = {
      callId: msg.payload?.callId || crypto.randomUUID(),
      peerId: msg.senderId,
      peerName: msg.senderName || 'Peer Contact',
      peerAvatar: msg.payload?.peerAvatar,
      direction: 'incoming',
      transport: msg.payload?.transport || 'direct_webrtc_lan',
      state: 'ringing',
      callType: msg.payload?.callType || 'audio',
      isGroup: Boolean(msg.payload?.isGroup),
      groupMemberCount: msg.payload?.groupMemberCount || 0,
      durationSeconds: 0,
      isMuted: false,
      isVideoEnabled: msg.payload?.callType === 'video',
      isSpeaker: true,
      localStream: null,
      remoteStream: null,
      localUserId: msg.targetId,
    };

    this.currentSession = session;
    this.notifySessionUpdate();
    this.playRingtone();

    // 45-Second incoming call timeout
    clearTimeout(this.ringingTimeout);
    this.ringingTimeout = setTimeout(() => {
      if (this.currentSession && this.currentSession.state === 'ringing') {
        console.log('[CallManager] Incoming call timed out');
        this.endCall(false, 'missed');
      }
    }, 45000);
  }

  /**
   * Accepts an incoming call
   */
  public async acceptIncomingCall(localUserId: string): Promise<void> {
    if (!this.currentSession || this.currentSession.state !== 'ringing') return;

    this.stopRingtone();
    clearTimeout(this.ringingTimeout);

    this.currentSession.localUserId = localUserId;
    this.currentSession.state = 'connecting';
    this.notifySessionUpdate();

    const peerId = this.currentSession.peerId;
    WebRTCService.resetInstance(localUserId, peerId);
    const rtc = WebRTCService.getInstance(localUserId, peerId);

    try {
      const withVideo = this.currentSession.callType === 'video';
      let localStream: MediaStream;
      try {
        localStream = await rtc.attachLocalMediaTrack(withVideo);
        this.currentSession.isVideoEnabled = withVideo;
      } catch (mediaErr) {
        if (withVideo) {
          localStream = await rtc.attachLocalMediaTrack(false);
          this.currentSession.callType = 'audio';
          this.currentSession.isVideoEnabled = false;
        } else {
          throw mediaErr;
        }
      }
      this.currentSession.localStream = localStream;
      this.setupAudioAnalysis(localStream);
    } catch (err) {
      console.error('Cannot access microphone/camera', err);
      this.endCall(true);
      return;
    }

    rtc.onRemoteStream = (remoteStream) => {
      console.log('[CallManager] Callee received remote stream!');
      if (this.currentSession) {
        this.currentSession.remoteStream = remoteStream;
        this.currentSession.state = 'connected';
        if (!this.currentSession.startTime) {
          this.currentSession.startTime = Date.now();
        }
        clearTimeout(this.connectionWatchdog);
        this.startCallTimer();
        this.notifySessionUpdate();

        // Switch analyser to incoming stream
        this.setupAudioAnalysis(remoteStream);
        this.playRemoteAudio(remoteStream);
      }
    };

    rtc.onStateChange = (state) => {
      if (state === 'connected' && this.currentSession) {
        clearTimeout(this.connectionWatchdog);
        if (this.currentSession.state !== 'connected') {
          this.currentSession.state = 'connected';
          if (!this.currentSession.startTime) {
            this.currentSession.startTime = Date.now();
          }
          this.startCallTimer();
          this.notifySessionUpdate();
        }
      } else if (state === 'failed' && this.currentSession && this.currentSession.state === 'connecting') {
        this.playBusyTone();
        setTimeout(() => this.endCall(false, 'missed'), 1800);
      }
    };

    // 25-Second connection watchdog
    clearTimeout(this.connectionWatchdog);
    this.connectionWatchdog = setTimeout(() => {
      if (this.currentSession && this.currentSession.state === 'connecting') {
        console.warn('[CallManager] Connection handshake watchdog timed out');
        this.playBusyTone();
        setTimeout(() => this.endCall(true, 'missed'), 1500);
      }
    }, 25000);

    // Notify caller that call was accepted
    rtc.sendSignalingMessage({
      type: 'call_response',
      senderId: localUserId,
      senderName: 'Contact',
      targetId: peerId,
      payload: { accepted: true },
      timestamp: Date.now(),
    });
  }

  /**
   * Rejects incoming call
   */
  public async rejectIncomingCall(localUserId: string): Promise<void> {
    if (!this.currentSession) return;
    this.stopRingtone();
    clearTimeout(this.ringingTimeout);

    const session = this.currentSession;
    const peerId = session.peerId;
    const rtc = WebRTCService.getInstance(localUserId, peerId);
    rtc.sendSignalingMessage({
      type: 'call_response',
      senderId: localUserId,
      senderName: 'Contact',
      targetId: peerId,
      payload: { accepted: false, reason: 'rejected' },
      timestamp: Date.now(),
    });

    this.resetSession();
    await this.logCallRecord('rejected', session);
    await this.createCallMessageRecord('rejected', session);
  }

  public async handleCallResponse(msg: any) {
    if (!this.currentSession || this.currentSession.direction !== 'outgoing') return;

    // Deduplicate response
    const respKey = `resp_${msg.senderId}_${msg.payload?.accepted ? 'acc' : 'rej'}_${msg.timestamp}`;
    if (this.processedCallSignals.has(respKey)) return;
    this.processedCallSignals.add(respKey);
    setTimeout(() => this.processedCallSignals.delete(respKey), 10000);

    if (msg.payload?.accepted) {
      this.stopRingtone();
      clearTimeout(this.unansweredTimeout);

      // Transition to authentic 'connecting' state while WebRTC handshakes
      this.currentSession.state = 'connecting';
      this.notifySessionUpdate();

      // Callee accepted! Now caller creates the WebRTC audio offer
      const localUserId = this.currentSession.localUserId || msg.targetId;
      const peerId = this.currentSession.peerId;
      const rtc = WebRTCService.getInstance(localUserId, peerId);

      // 25-Second handshake watchdog
      clearTimeout(this.connectionWatchdog);
      this.connectionWatchdog = setTimeout(() => {
        if (this.currentSession && this.currentSession.state === 'connecting') {
          console.warn('[CallManager] Handshake timed out waiting for audio channel');
          this.playBusyTone();
          setTimeout(() => this.endCall(true, 'missed'), 1500);
        }
      }, 25000);

      try {
        const offer = await rtc.createOffer(true);
        rtc.sendSignalingMessage({
          type: 'offer',
          senderId: localUserId,
          senderName: 'Caller',
          targetId: peerId,
          payload: offer,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error('Failed to create audio offer upon acceptance', err);
        this.endCall(true, 'missed');
      }
    } else {
      // Peer declined or busy
      this.stopRingtone();
      clearTimeout(this.unansweredTimeout);
      this.playBusyTone();
      setTimeout(() => {
        this.endCall(false, 'rejected');
      }, 1800);
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
   * Toggles camera video on/off
   */
  public toggleVideo(): boolean {
    if (!this.currentSession || !this.currentSession.localStream) return false;
    const tracks = this.currentSession.localStream.getVideoTracks();
    if (tracks.length > 0) {
      tracks[0].enabled = !tracks[0].enabled;
      this.currentSession.isVideoEnabled = tracks[0].enabled;
      this.notifySessionUpdate();
      return this.currentSession.isVideoEnabled;
    }
    return false;
  }

  /**
   * Toggles speaker output
   */
  public toggleSpeaker(): boolean {
    if (!this.currentSession) return false;
    this.currentSession.isSpeaker = !this.currentSession.isSpeaker;
    const audioElement = document.getElementById('shongjog_hardware_audio') as HTMLAudioElement;
    if (audioElement && 'setSinkId' in audioElement) {
      try {
        (audioElement as any).setSinkId(this.currentSession.isSpeaker ? 'default' : 'communications');
      } catch {}
    }
    this.notifySessionUpdate();
    return Boolean(this.currentSession.isSpeaker);
  }

  /**
   * Ends active call and records to IndexedDB and conversation history
   */
  public async endCall(notifyPeer: boolean = true, status: 'completed' | 'missed' | 'rejected' = 'completed'): Promise<void> {
    this.stopRingtone();
    clearInterval(this.timerInterval);
    clearTimeout(this.unansweredTimeout);
    clearTimeout(this.ringingTimeout);
    clearTimeout(this.connectionWatchdog);

    const session = this.currentSession;
    if (!session) {
      this.resetSession();
      return;
    }

    const peerId = session.peerId;
    const localUserId = session.localUserId || this.getLocalUserId() || 'local_user';

    if (session.state === 'calling' || session.state === 'ringing' || session.state === 'connecting') {
      if (status === 'completed') status = 'missed';
    }

    // Dismiss UI IMMEDIATELY so the user or callee never sees a stuck modal
    this.resetSession();

    if (notifyPeer) {
      try {
        const rtc = WebRTCService.getInstance(localUserId, peerId);
        rtc.sendSignalingMessage({
          type: 'call_end',
          senderId: localUserId,
          senderName: 'User',
          targetId: peerId,
          payload: {},
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('Failed to dispatch call_end signal:', err);
      }
    }

    // Clean up WebRTC peer connection
    try {
      WebRTCService.resetInstance(localUserId, peerId);
    } catch {}

    // Async record log & message in background without blocking UI
    try {
      await this.logCallRecord(status, session);
      await this.createCallMessageRecord(status, session);
    } catch (err) {
      console.warn('Failed to record call records:', err);
    }
  }

  private async createCallMessageRecord(status: 'completed' | 'missed' | 'rejected', session: ActiveCallSession): Promise<void> {
    try {
      const db = await getDatabase();
      const callTypeLabel = session.callType === 'video' ? 'Video call' : 'Voice call';
      const icon = session.callType === 'video' ? '📹' : '📞';

      let contentText = '';
      if (status === 'completed') {
        const dur = session.durationSeconds || 0;
        const m = Math.floor(dur / 60);
        const s = dur % 60;
        const timeStr = m > 0 ? `${m}m ${s}s` : `${s}s`;
        contentText = `${icon} ${session.direction === 'outgoing' ? 'Outgoing' : 'Incoming'} ${callTypeLabel} (${timeStr})`;
      } else if (status === 'missed') {
        if (session.direction === 'outgoing') {
          contentText = `${icon} Outgoing ${callTypeLabel.toLowerCase()} (Cancelled)`;
        } else {
          contentText = `${icon} Missed ${callTypeLabel.toLowerCase()}`;
        }
      } else if (status === 'rejected') {
        if (session.direction === 'outgoing') {
          contentText = `${icon} Outgoing ${callTypeLabel.toLowerCase()} (Declined)`;
        } else {
          contentText = `${icon} Missed ${callTypeLabel.toLowerCase()}`;
        }
      }

      // Determine conversationId
      let convId = session.isGroup ? session.peerId : null;
      const myId = session.localUserId || this.getLocalUserId();
      if (!convId && myId) {
        const allConvs = await db.getAll('conversations');
        const directConv = allConvs.find(
          (c) => c && c.type === 'direct' && Array.isArray(c.participantIds) && c.participantIds.includes(session.peerId) && c.participantIds.includes(myId)
        );
        convId = directConv ? directConv.id : null;
      }

      if (!convId) {
        convId = session.peerId;
      }

      const callMessage: Message = {
        id: crypto.randomUUID(),
        conversationId: convId,
        senderId: session.direction === 'outgoing' ? (myId || 'me') : session.peerId,
        senderDeviceId: 'device',
        recipientId: session.direction === 'outgoing' ? session.peerId : (myId || undefined),
        type: 'call_event',
        content: contentText,
        timestamp: Date.now(),
        status: 'delivered',
        transport: session.transport || 'direct_webrtc_lan',
        media: {
          durationSeconds: session.durationSeconds,
        },
      };

      await db.put('messages', callMessage);

      let conv = await db.get('conversations', convId);
      if (conv) {
        conv.lastMessageSnippet = contentText;
        conv.lastMessageTimestamp = callMessage.timestamp;
        conv.updatedAt = callMessage.timestamp;
        await db.put('conversations', conv);
      }

      if (TransportManager.onIncomingMessage) {
        TransportManager.onIncomingMessage(callMessage);
      }
      TransportManager.broadcastEvent({
        type: 'call_message',
        message: callMessage,
      });
    } catch (err) {
      console.warn('Could not record call message', err);
    }
  }

  private async logCallRecord(status: 'completed' | 'missed' | 'rejected', session: ActiveCallSession): Promise<void> {
    try {
      const db = await getDatabase();
      const callLog: CallLog = {
        id: session.callId,
        peerId: session.peerId,
        peerName: session.peerName,
        peerPhone: session.peerPhone,
        direction: session.direction,
        status,
        durationSeconds: session.durationSeconds,
        transport: session.transport,
        timestamp: session.startTime || Date.now(),
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
    if (this.currentSession?.remoteStream) {
      this.currentSession.remoteStream.getTracks().forEach((track) => track.stop());
    }
    const hardwareAudio = document.getElementById('shongjog_hardware_audio') as HTMLAudioElement;
    if (hardwareAudio) {
      hardwareAudio.pause();
      hardwareAudio.srcObject = null;
      hardwareAudio.remove();
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

  public playRemoteAudio(stream: MediaStream) {
    if (!stream) return;
    // Ensure all incoming audio tracks are explicitly enabled
    stream.getAudioTracks().forEach((track) => {
      track.enabled = true;
    });

    let audioElement = document.getElementById('shongjog_hardware_audio') as HTMLAudioElement;
    if (!audioElement) {
      audioElement = document.createElement('audio');
      audioElement.id = 'shongjog_hardware_audio';
      audioElement.autoplay = true;
      (audioElement as any).playsInline = true;
      audioElement.volume = 1.0;
      audioElement.muted = false;
      audioElement.style.position = 'fixed';
      audioElement.style.bottom = '0px';
      audioElement.style.left = '0px';
      audioElement.style.width = '1px';
      audioElement.style.height = '1px';
      audioElement.style.opacity = '0';
      audioElement.style.pointerEvents = 'none';
      document.body.appendChild(audioElement);
    }
    audioElement.muted = false;
    audioElement.volume = 1.0;
    if (audioElement.srcObject !== stream) {
      audioElement.srcObject = stream;
    }
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[CallManager] Remote audio playback waiting for user gesture:', err);
      });
    }
  }

  public resumeAudioContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    const audioElement = document.getElementById('shongjog_hardware_audio') as HTMLAudioElement;
    if (audioElement && audioElement.paused) {
      audioElement.play().catch(() => {});
    }
  }

  // --- Real-time Visualizer Audio Analysis ---
  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
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

        if (this.currentSession.state === 'connected' || this.currentSession.state === 'calling') {
          requestAnimationFrame(checkLevel);
        }
      };

      requestAnimationFrame(checkLevel);
    } catch (err) {
      console.warn('Audio analyser setup error', err);
    }
  }

  // --- Web Audio Synthesized Ringtones & Telephone Cadences ---

  /**
   * Authentic Ringback Tone (Dual Tone 400Hz + 450Hz pulsing: 1.2s ON, 2.0s OFF)
   */
  private playDialTone() {
    this.stopRingtone();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const pulseBeep = () => {
        if (!this.audioContext || this.audioContext.state === 'closed') return;
        try {
          const now = this.audioContext.currentTime;
          const osc1 = this.audioContext.createOscillator();
          const osc2 = this.audioContext.createOscillator();
          const gain = this.audioContext.createGain();

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(400, now);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(450, now);

          // Smooth attack & release envelope for 1.2s tone
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
          gain.gain.setValueAtTime(0.08, now + 1.15);
          gain.gain.linearRampToValueAtTime(0, now + 1.2);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.audioContext.destination);

          osc1.start(now);
          osc2.start(now);
          osc1.stop(now + 1.25);
          osc2.stop(now + 1.25);

          this.activeOscillators.push(osc1, osc2);
        } catch {}
      };

      pulseBeep();
      this.cadenceInterval = setInterval(pulseBeep, 3200);
    } catch (e) {
      console.warn('Could not play dial tone', e);
    }
  }

  /**
   * Melodic Incoming Call Ringtone (Pulsing Chime Sequence: 587Hz & 880Hz)
   */
  private playRingtone() {
    this.stopRingtone();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const pulseChime = () => {
        if (!this.audioContext || this.audioContext.state === 'closed') return;
        try {
          const now = this.audioContext.currentTime;
          const notes = [587.33, 739.99, 880.0]; // D5, F#5, A5 chord

          notes.forEach((freq, idx) => {
            const osc = this.audioContext!.createOscillator();
            const gain = this.audioContext!.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);

            gain.gain.setValueAtTime(0, now + idx * 0.12);
            gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.12 + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.7);

            osc.connect(gain);
            gain.connect(this.audioContext!.destination);

            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.75);

            this.activeOscillators.push(osc);
          });
        } catch {}
      };

      pulseChime();
      this.cadenceInterval = setInterval(pulseChime, 2400);
    } catch (e) {
      console.warn('Could not play ringtone', e);
    }
  }

  /**
   * Fast Busy / Disconnected Tone (480Hz + 620Hz pulsed at 0.5s intervals)
   */
  public playBusyTone() {
    this.stopRingtone();
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx();
      const now = this.audioContext.currentTime;

      for (let i = 0; i < 3; i++) {
        const start = now + i * 0.5;
        const osc1 = this.audioContext.createOscillator();
        const osc2 = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc1.frequency.setValueAtTime(480, start);
        osc2.frequency.setValueAtTime(620, start);

        gain.gain.setValueAtTime(0.1, start);
        gain.gain.setValueAtTime(0, start + 0.25);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioContext.destination);

        osc1.start(start);
        osc2.start(start);
        osc1.stop(start + 0.25);
        osc2.stop(start + 0.25);
      }
    } catch {}
  }

  private stopRingtone() {
    clearInterval(this.cadenceInterval);
    this.cadenceInterval = null;

    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {}
    });
    this.activeOscillators = [];

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
