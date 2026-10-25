// Offline Direct Pairing & Signaling Exchange
// Enables zero-internet device-to-device WebRTC handshake over local Wi-Fi / hotspot / Bluetooth tethering
// Uses compact base64 JSON payload for instant QR / Code exchange

export interface OfflinePairingPayload {
  v: number; // version 1
  type: 'offer' | 'answer';
  senderId: string;
  senderName: string;
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidateInit[];
  timestamp: number;
}

export class OfflinePairing {
  /**
   * Compresses a pairing payload to a compact shareable base64 string
   */
  public static encodePayload(payload: OfflinePairingPayload): string {
    const jsonStr = JSON.stringify(payload);
    return window.btoa(encodeURIComponent(jsonStr));
  }

  /**
   * Decodes a shareable base64 string back into a pairing payload
   */
  public static decodePayload(code: string): OfflinePairingPayload {
    const clean = code.trim();
    const jsonStr = decodeURIComponent(window.atob(clean));
    return JSON.parse(jsonStr) as OfflinePairingPayload;
  }

  /**
   * Generates a complete standalone offer payload with collected ICE candidates
   */
  public static async generateDirectOffer(
    localUserId: string,
    localUserName: string,
    withAudio: boolean = false
  ): Promise<{
    pc: RTCPeerConnection;
    dc: RTCDataChannel;
    pairingCode: string;
    localAudioStream?: MediaStream;
  }> {
    const config: RTCConfiguration = {
      iceServers: [], // Pure local host candidates for offline LAN
    };

    const pc = new RTCPeerConnection(config);
    const dc = pc.createDataChannel('offline_transport_channel', { ordered: true });
    dc.binaryType = 'arraybuffer';

    let localAudioStream: MediaStream | undefined;
    if (withAudio) {
      localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localAudioStream.getAudioTracks().forEach((track) => pc.addTrack(track, localAudioStream!));
    }

    const candidates: RTCIceCandidateInit[] = [];

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
    });
    await pc.setLocalDescription(offer);

    // Collect ICE candidates until gathering completes or timeout
    await new Promise<void>((resolve) => {
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate.toJSON());
        } else {
          resolve();
        }
      };
      // 1.2 second gathering timeout
      setTimeout(() => resolve(), 1200);
    });

    const payload: OfflinePairingPayload = {
      v: 1,
      type: 'offer',
      senderId: localUserId,
      senderName: localUserName,
      sdp: pc.localDescription!.toJSON(),
      candidates,
      timestamp: Date.now(),
    };

    return {
      pc,
      dc,
      pairingCode: this.encodePayload(payload),
      localAudioStream,
    };
  }

  /**
   * Responds to an offline offer and generates the answer pairing payload
   */
  public static async generateDirectAnswer(
    offerCode: string,
    localUserId: string,
    localUserName: string,
    withAudio: boolean = false
  ): Promise<{
    pc: RTCPeerConnection;
    answerCode: string;
    localAudioStream?: MediaStream;
    onDataChannel: (cb: (channel: RTCDataChannel) => void) => void;
  }> {
    const offerPayload = this.decodePayload(offerCode);
    if (offerPayload.type !== 'offer') {
      throw new Error('Provided pairing code is not an offer payload');
    }

    const config: RTCConfiguration = { iceServers: [] };
    const pc = new RTCPeerConnection(config);

    let channelCallback: ((channel: RTCDataChannel) => void) | null = null;
    pc.ondatachannel = (e) => {
      if (channelCallback) channelCallback(e.channel);
    };

    let localAudioStream: MediaStream | undefined;
    if (withAudio) {
      localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localAudioStream.getAudioTracks().forEach((track) => pc.addTrack(track, localAudioStream!));
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offerPayload.sdp));

    // Add offer candidates
    for (const cand of offerPayload.candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        // Safe skip non-viable candidates
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const candidates: RTCIceCandidateInit[] = [];
    await new Promise<void>((resolve) => {
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          candidates.push(e.candidate.toJSON());
        } else {
          resolve();
        }
      };
      setTimeout(() => resolve(), 1200);
    });

    const answerPayload: OfflinePairingPayload = {
      v: 1,
      type: 'answer',
      senderId: localUserId,
      senderName: localUserName,
      sdp: pc.localDescription!.toJSON(),
      candidates,
      timestamp: Date.now(),
    };

    return {
      pc,
      answerCode: this.encodePayload(answerPayload),
      localAudioStream,
      onDataChannel: (cb) => {
        channelCallback = cb;
      },
    };
  }

  /**
   * Completes the handshake on the offerer's side with the answer code
   */
  public static async applyDirectAnswer(pc: RTCPeerConnection, answerCode: string): Promise<void> {
    const answerPayload = this.decodePayload(answerCode);
    if (answerPayload.type !== 'answer') {
      throw new Error('Provided code is not an answer payload');
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answerPayload.sdp));
    for (const cand of answerPayload.candidates) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch {
        // Continue
      }
    }
  }
}
