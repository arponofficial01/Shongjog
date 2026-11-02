// Real WebRTC Transport Service
// Supports direct Audio Calling (MediaStream) and Data Channels for offline messages & files
// Handles signaling via:
// 1. Direct WebRTC DataChannel (for already paired air-gapped devices)
// 2. Local LAN / Hotspot Hub (Zero-Internet Wi-Fi / Hotspot calling via LanSignalingService)
// 3. Supabase Realtime (when internet is available)
// 4. BroadcastChannel (Local browser tabs/devices test)

import { LanSignalingService } from './lanSignalingService';

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'call_request' | 'call_response' | 'call_end' | 'mesh_action';
  senderId: string;
  senderName: string;
  targetId: string;
  payload: any;
  timestamp: number;
}

export type WebRTCConnectionState = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed';

export class WebRTCService {
  private static instances: Map<string, WebRTCService> = new Map();
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private localAudioStream: MediaStream | null = null;
  private remoteAudioStream: MediaStream | null = null;

  public peerId: string;
  public localUserId: string;
  public connectionState: WebRTCConnectionState = 'disconnected';

  // Event Listeners
  public onStateChange?: (state: WebRTCConnectionState) => void;
  public onDataReceived?: (data: any) => void;
  public onRemoteStream?: (stream: MediaStream) => void;
  public onSignalingMessageNeeded?: (msg: SignalingMessage) => void;

  private broadcastChannel: BroadcastChannel | null = null;

  private constructor(localUserId: string, peerId: string) {
    this.localUserId = localUserId;
    this.peerId = peerId;
    this.setupBroadcastSignaling();
  }

  public static getInstance(localUserId: string, peerId: string): WebRTCService {
    const key = `${localUserId}_${peerId}`;
    if (!this.instances.has(key)) {
      this.instances.set(key, new WebRTCService(localUserId, peerId));
    }
    return this.instances.get(key)!;
  }

  private setupBroadcastSignaling() {
    try {
      this.broadcastChannel = new BroadcastChannel('offline_mesh_signaling');
      this.broadcastChannel.onmessage = (event) => {
        const msg: SignalingMessage = event.data;
        if (msg.targetId === this.localUserId && msg.senderId === this.peerId) {
          this.handleIncomingSignalingMessage(msg);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported in this environment', e);
    }
  }

  public static globalSignalingDelegate?: (msg: SignalingMessage) => void;
  public static onChatMessageReceived?: (msg: any) => void;

  public sendSignalingMessage(msg: SignalingMessage) {
    // 1. Direct WebRTC DataChannel (if already connected peer-to-peer)
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      try {
        this.dataChannel.send(JSON.stringify({ protocol: 'webrtc_signaling', signal: msg }));
      } catch (err) {
        console.warn('[WebRTC DataChannel Signaling Error]:', err);
      }
    }

    // 2. Local Wi-Fi / Hotspot LAN Hub (Zero-Internet real-time local signaling)
    LanSignalingService.sendSignal(msg).catch(() => {});

    // 3. Delegate to external caller / Supabase Realtime (when internet is available)
    if (this.onSignalingMessageNeeded) {
      this.onSignalingMessageNeeded(msg);
    }
    if (WebRTCService.globalSignalingDelegate) {
      WebRTCService.globalSignalingDelegate(msg);
    }

    // 4. Local BroadcastChannel (same-host multi-tab test)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('BroadcastChannel error', err);
      }
    }
  }

  private iceCandidateQueue: RTCIceCandidateInit[] = [];

  /**
   * Initializes RTCPeerConnection with STUN fallback (for internet) and host candidates (for offline LAN)
   */
  public async initPeerConnection(withAudio: boolean = false): Promise<RTCPeerConnection> {
    if (!this.peerConnection || this.peerConnection.signalingState === 'closed') {
      const config: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
          { urls: 'stun:stun.cloudflare.com:3478' },
          { urls: 'stun:stun.nextcloud.com:443' },
          { urls: 'stun:stun.services.mozilla.com' },
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      };

      this.peerConnection = new RTCPeerConnection(config);
      this.remoteAudioStream = new MediaStream();

      this.peerConnection.onconnectionstatechange = () => {
        if (!this.peerConnection) return;
        const state = this.peerConnection.connectionState as WebRTCConnectionState;
        this.connectionState = state;
        if (this.onStateChange) this.onStateChange(state);
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        if (!this.peerConnection) return;
        const iceState = this.peerConnection.iceConnectionState;
        console.log('[WebRTC] iceConnectionState:', iceState);
        if (iceState === 'connected' || iceState === 'completed') {
          if (this.connectionState !== 'connected') {
            this.connectionState = 'connected';
            if (this.onStateChange) this.onStateChange('connected');
          }
        } else if (iceState === 'failed') {
          if (this.connectionState !== 'failed') {
            this.connectionState = 'failed';
            if (this.onStateChange) this.onStateChange('failed');
          }
        }
      };

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && event.candidate.candidate) {
          const candidateData = event.candidate.toJSON ? event.candidate.toJSON() : {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
            usernameFragment: event.candidate.usernameFragment,
          };
          this.sendSignalingMessage({
            type: 'candidate',
            senderId: this.localUserId,
            senderName: 'Device',
            targetId: this.peerId,
            payload: candidateData,
            timestamp: Date.now(),
          });
        }
      };

      // Handle remote media tracks (Audio & Video)
      this.peerConnection.ontrack = (event) => {
        console.log('[WebRTC] ontrack event received:', event.track.kind, 'stream count:', event.streams.length);
        if (event.track) {
          event.track.enabled = true;
        }

        // Direct native stream binding ensures hardware audio clock works across Android WebView & Electron
        if (event.streams && event.streams[0]) {
          this.remoteAudioStream = event.streams[0];
          this.remoteAudioStream.getAudioTracks().forEach((track) => {
            track.enabled = true;
          });
        } else {
          if (!this.remoteAudioStream) {
            this.remoteAudioStream = new MediaStream();
          }
          if (event.track && !this.remoteAudioStream.getTracks().some((t) => t.id === event.track.id)) {
            this.remoteAudioStream.addTrack(event.track);
          }
        }

        if (this.onRemoteStream && this.remoteAudioStream) {
          this.onRemoteStream(this.remoteAudioStream);
        }
      };
    }

    // Always ensure available local audio/video tracks are attached to the peerConnection
    if (this.localAudioStream) {
      const senders = this.peerConnection.getSenders();
      this.localAudioStream.getTracks().forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track?.id === track.id);
        if (!alreadyAdded) {
          this.peerConnection?.addTrack(track, this.localAudioStream!);
        }
      });
    } else if (withAudio) {
      await this.attachLocalAudioTrack();
    }

    // Guarantee bidirectional transceivers for both audio and video
    try {
      const senders = this.peerConnection.getSenders();
      if (!senders.some((s) => s.track?.kind === 'audio')) {
        this.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });
      }
      if (!senders.some((s) => s.track?.kind === 'video')) {
        this.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
      }
    } catch {}

    return this.peerConnection;
  }

  /**
   * Captures microphone audio & optional video using MediaDevices API and adds tracks to RTCPeerConnection
   */
  public async attachLocalMediaTrack(withVideo: boolean = false): Promise<MediaStream> {
    if (!this.localAudioStream) {
      try {
        this.localAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: withVideo
            ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            : false,
        });
      } catch (err) {
        // Fallback for hardware drivers that fail on complex constraints
        try {
          this.localAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
          });
        } catch (fbErr) {
          if (withVideo) {
            this.localAudioStream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
          } else {
            throw fbErr;
          }
        }
      }
      // Ensure all local audio tracks are active
      this.localAudioStream.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });
    } else if (withVideo && this.localAudioStream.getVideoTracks().length === 0) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          this.localAudioStream.addTrack(videoTrack);
          if (this.peerConnection) {
            this.peerConnection.addTrack(videoTrack, this.localAudioStream);
          }
        }
      } catch (e) {
        console.warn('Could not add video track', e);
      }
    }

    if (this.peerConnection) {
      const senders = this.peerConnection.getSenders();
      this.localAudioStream.getTracks().forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track?.id === track.id);
        if (!alreadyAdded) {
          this.peerConnection?.addTrack(track, this.localAudioStream!);
        }
      });
    }

    return this.localAudioStream;
  }

  /**
   * Captures microphone audio using MediaDevices API and adds track to RTCPeerConnection
   */
  public async attachLocalAudioTrack(): Promise<MediaStream> {
    return this.attachLocalMediaTrack(false);
  }

  public getLocalAudioStream(): MediaStream | null {
    return this.localAudioStream;
  }

  public getRemoteAudioStream(): MediaStream | null {
    return this.remoteAudioStream;
  }

  public setMicrophoneMuted(muted: boolean): void {
    if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  /**
   * Sets up RTCDataChannel for real direct message and file transmission
   */
  public setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel;
    this.dataChannel.binaryType = 'arraybuffer';

    this.dataChannel.onopen = () => {
      this.connectionState = 'connected';
      if (this.onStateChange) this.onStateChange('connected');
    };

    this.dataChannel.onclose = () => {
      this.connectionState = 'disconnected';
      if (this.onStateChange) this.onStateChange('disconnected');
    };

    this.dataChannel.onmessage = (event) => {
      let payload: any = event.data;
      if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data);
        } catch {
          payload = event.data;
        }
      }

      if (payload && payload.protocol === 'webrtc_signaling' && payload.signal) {
        this.handleIncomingSignalingMessage(payload.signal);
      }

      if (payload && payload.protocol === 'chat_message' && payload.message) {
        if (WebRTCService.onChatMessageReceived) {
          WebRTCService.onChatMessageReceived(payload.message);
        }
      }

      if (this.onDataReceived) {
        this.onDataReceived(payload);
      }
    };
  }

  /**
   * Initiates a connection offer (Caller / Sender role)
   */
  public async createOffer(withAudio: boolean = false): Promise<RTCSessionDescriptionInit> {
    const pc = await this.initPeerConnection(withAudio);

    // Create Data Channel if not already existing
    const dc = pc.createDataChannel('offline_transport_channel', {
      ordered: true,
    });
    this.setupDataChannel(dc);

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(offer);

    return offer;
  }

  /**
   * Responds to an incoming connection offer (Callee / Receiver role)
   */
  public async handleOfferAndCreateAnswer(
    offer: RTCSessionDescriptionInit,
    withAudio: boolean = false
  ): Promise<RTCSessionDescriptionInit> {
    const pc = await this.initPeerConnection(withAudio);

    pc.ondatachannel = (event) => {
      this.setupDataChannel(event.channel);
    };

    if (pc.signalingState !== 'stable') {
      console.warn('[WebRTC] Receiving offer in non-stable state:', pc.signalingState);
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushIceCandidateQueue();

    const answer = await pc.createAnswer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await pc.setLocalDescription(answer);

    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    if (this.peerConnection.signalingState !== 'have-local-offer') {
      console.warn('[WebRTC] Ignoring answer in invalid state:', this.peerConnection.signalingState);
      return;
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushIceCandidateQueue();
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!candidate || !candidate.candidate) return;
    if (!this.peerConnection || !this.peerConnection.remoteDescription || !this.peerConnection.remoteDescription.type) {
      // Buffer ICE candidate until remote description is applied
      this.iceCandidateQueue.push(candidate);
      return;
    }
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.warn('Could not add ICE candidate', err);
    }
  }

  private async flushIceCandidateQueue(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      if (candidate && candidate.candidate) {
        try {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('Error applying queued ICE candidate', e);
        }
      }
    }
  }

  /**
   * Sends data directly across the WebRTC DataChannel without touching any server
   */
  public sendData(data: any): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false;
    }
    if (typeof data === 'string' || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
      this.dataChannel.send(data as any);
    } else {
      this.dataChannel.send(JSON.stringify(data));
    }
    return true;
  }

  /**
   * Adopts an already-established RTCPeerConnection and RTCDataChannel (e.g. from Offline Pairing)
   */
  public adoptConnection(pc: RTCPeerConnection, dc: RTCDataChannel) {
    if (this.peerConnection && this.peerConnection !== pc) {
      try {
        this.peerConnection.close();
      } catch {
        // safe close
      }
    }
    this.peerConnection = pc;
    this.setupDataChannel(dc);
    this.connectionState = dc.readyState === 'open' ? 'connected' : 'connecting';
    if (this.onStateChange) this.onStateChange(this.connectionState);

    // Ensure ICE candidates generated by this adopted PC are dispatched
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage({
          type: 'candidate',
          senderId: this.localUserId,
          senderName: 'Device',
          targetId: this.peerId,
          payload: event.candidate,
          timestamp: Date.now(),
        });
      }
    };

    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteAudioStream = event.streams[0];
      } else if (event.track) {
        if (!this.remoteAudioStream) this.remoteAudioStream = new MediaStream();
        this.remoteAudioStream.addTrack(event.track);
      }
      if (this.onRemoteStream && this.remoteAudioStream) {
        this.onRemoteStream(this.remoteAudioStream);
      }
    };
  }

  private static processedSignalSignatures: Set<string> = new Set();

  /**
   * Processes incoming signaling message
   */
  public async handleIncomingSignalingMessage(msg: SignalingMessage): Promise<void> {
    if (!msg || !msg.type) return;

    // Deduplicate identical signals delivered concurrently across multiple transports (Supabase, LAN, BroadcastChannel)
    const sigKey = `${msg.senderId}_${msg.targetId}_${msg.type}_${msg.timestamp}_${
      msg.payload?.type || (msg.payload?.candidate ? String(msg.payload.candidate).slice(0, 30) : '')
    }`;
    if (WebRTCService.processedSignalSignatures.has(sigKey)) {
      return;
    }
    WebRTCService.processedSignalSignatures.add(sigKey);
    setTimeout(() => WebRTCService.processedSignalSignatures.delete(sigKey), 8000);

    if (msg.type === 'offer') {
      const hasAudio = Boolean(this.localAudioStream && this.localAudioStream.getAudioTracks().length > 0);
      const answer = await this.handleOfferAndCreateAnswer(msg.payload, hasAudio);
      this.sendSignalingMessage({
        type: 'answer',
        senderId: this.localUserId,
        senderName: 'Device',
        targetId: this.peerId,
        payload: answer,
        timestamp: Date.now(),
      });
    } else if (msg.type === 'answer') {
      await this.handleAnswer(msg.payload);
    } else if (msg.type === 'candidate') {
      await this.addIceCandidate(msg.payload);
    }
  }

  /**
   * Hang up and close media tracks and peer connection
   */
  public close(): void {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach((track) => track.stop());
      this.localAudioStream = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.connectionState = 'closed';
    this.remoteAudioStream = null;
    this.iceCandidateQueue = [];
    if (this.onStateChange) this.onStateChange('closed');
  }

  public static resetInstance(localUserId: string, peerId: string) {
    const key = `${localUserId}_${peerId}`;
    if (this.instances.has(key)) {
      this.instances.get(key)!.close();
      this.instances.delete(key);
    }
  }
}
