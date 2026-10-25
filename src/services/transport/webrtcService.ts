// Real WebRTC Transport Service
// Supports direct Audio Calling (MediaStream) and Data Channels for offline messages & files
// Handles signaling via:
// 1. BroadcastChannel (Local browser tabs/devices test)
// 2. Direct Offline Pairing Exchange (Token / QR code for air-gapped / local LAN pairing)
// 3. Supabase Realtime Signaling (when internet is available)

export interface SignalingMessage {
  type: 'offer' | 'answer' | 'candidate' | 'call_request' | 'call_response' | 'call_end';
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

  public sendSignalingMessage(msg: SignalingMessage) {
    // 1. Try local BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (err) {
        console.warn('BroadcastChannel error', err);
      }
    }
    // 2. Delegate to external caller (e.g. Supabase Realtime or Manual Pairing UI)
    if (this.onSignalingMessageNeeded) {
      this.onSignalingMessageNeeded(msg);
    }
  }

  /**
   * Initializes RTCPeerConnection with STUN fallback (for internet) and host candidates (for offline LAN)
   */
  public async initPeerConnection(withAudio: boolean = false): Promise<RTCPeerConnection> {
    if (this.peerConnection && this.peerConnection.signalingState !== 'closed') {
      return this.peerConnection;
    }

    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    };

    this.peerConnection = new RTCPeerConnection(config);
    this.remoteAudioStream = new MediaStream();

    this.peerConnection.onconnectionstatechange = () => {
      if (!this.peerConnection) return;
      const state = this.peerConnection.connectionState as WebRTCConnectionState;
      this.connectionState = state;
      if (this.onStateChange) this.onStateChange(state);
    };

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

    // Handle remote media tracks (Audio)
    this.peerConnection.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteAudioStream = event.streams[0];
      } else if (event.track) {
        this.remoteAudioStream?.addTrack(event.track);
      }
      if (this.onRemoteStream && this.remoteAudioStream) {
        this.onRemoteStream(this.remoteAudioStream);
      }
    };

    // If audio is requested, add local media tracks
    if (withAudio) {
      await this.attachLocalAudioTrack();
    }

    return this.peerConnection;
  }

  /**
   * Captures microphone audio using MediaDevices API and adds track to RTCPeerConnection
   */
  public async attachLocalAudioTrack(): Promise<MediaStream> {
    if (!this.localAudioStream) {
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    }

    if (this.peerConnection) {
      this.localAudioStream.getAudioTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, this.localAudioStream!);
      });
    }

    return this.localAudioStream;
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
      if (this.onDataReceived) {
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data);
            this.onDataReceived(parsed);
          } catch {
            this.onDataReceived(event.data);
          }
        } else {
          // Binary arraybuffer (file chunk or voice data)
          this.onDataReceived(event.data);
        }
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

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    return answer;
  }

  public async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return;
    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('Error adding ICE candidate', e);
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
   * Processes incoming signaling message
   */
  public async handleIncomingSignalingMessage(msg: SignalingMessage): Promise<void> {
    if (msg.type === 'offer') {
      const answer = await this.handleOfferAndCreateAnswer(msg.payload, false);
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
    if (this.onStateChange) this.onStateChange('closed');
  }
}
