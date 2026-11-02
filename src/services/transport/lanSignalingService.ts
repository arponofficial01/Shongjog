// Local LAN / Hotspot Zero-Internet Signaling Service
// Delivers real-time WebRTC call and message signaling over the local Wi-Fi or mobile hotspot network
// Uses lightweight Server-Sent Events (SSE) and HTTP POST to communicate with the local network hub

import type { SignalingMessage } from './webrtcService';
import { WebRTCService } from './webrtcService';
import { CallManager } from '../call/callManager';
import { TransportManager } from './transportManager';

export class LanSignalingService {
  private static instance: LanSignalingService | null = null;
  private eventSource: EventSource | null = null;
  private currentUserId: string | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: any = null;
  private processedSignals: Set<string> = new Set();

  public static getInstance(): LanSignalingService {
    if (!this.instance) {
      this.instance = new LanSignalingService();
    }
    return this.instance;
  }

  /**
   * Initializes local LAN signaling for the given user ID
   */
  public init(userId: string) {
    if (this.currentUserId === userId && this.isConnected) return;
    this.currentUserId = userId;
    this.connect();
  }

  private connect() {
    if (!this.currentUserId || typeof window === 'undefined') return;

    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }

    try {
      const streamUrl = `/api/lan-signaling/stream?userId=${encodeURIComponent(this.currentUserId)}`;
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.isConnected = true;
        console.log('[LAN Signaling] Connected to local network signaling hub');
      };

      this.eventSource.onmessage = (event) => {
        if (!event.data) return;
        try {
          const signal: SignalingMessage = JSON.parse(event.data);
          this.handleIncomingSignal(signal);
        } catch (err) {
          console.warn('[LAN Signaling] Malformed signal event', err);
        }
      };

      this.eventSource.onerror = () => {
        this.isConnected = false;
        if (this.eventSource) {
          try {
            this.eventSource.close();
          } catch {}
          this.eventSource = null;
        }
        // Auto-reconnect with 3-second delay
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      };
    } catch (e) {
      console.warn('[LAN Signaling] Connection setup error', e);
    }
  }

  private handleIncomingSignal(signal: SignalingMessage) {
    if (!signal || !signal.type || !this.currentUserId) return;

    // Deduplicate signals (prevent echo from multi-channel delivery)
    const candidateId = signal.type === 'candidate'
      ? (signal.payload?.candidate ? String(signal.payload.candidate).slice(0, 40) : JSON.stringify(signal.payload))
      : (signal.payload?.type || '');
    const dedupKey = `${signal.senderId}_${signal.type}_${candidateId}_${signal.timestamp}`;
    if (this.processedSignals.has(dedupKey)) return;
    this.processedSignals.add(dedupKey);
    // Prune set after 10 seconds
    setTimeout(() => this.processedSignals.delete(dedupKey), 10000);

    const isDirectToMe = signal.targetId === this.currentUserId;
    const isGroupForMe = Boolean(signal.payload?.isGroup) && signal.senderId !== this.currentUserId;
    const isBroadcast = signal.targetId === 'all' && signal.senderId !== this.currentUserId;
    if (!isDirectToMe && !isGroupForMe && !isBroadcast) return;

    console.log('[LAN Signaling] Received signal:', signal.type, 'from:', signal.senderName || signal.senderId);

    if (signal.type === 'mesh_action') {
      TransportManager.handleIncomingMeshEvent(signal.payload);
    } else if (signal.type === 'call_request') {
      CallManager.getInstance().handleIncomingCallRequest(signal);
    } else if (signal.type === 'call_response') {
      CallManager.getInstance().handleCallResponse(signal);
    } else if (signal.type === 'call_end') {
      CallManager.getInstance().endCall(false);
    } else {
      // WebRTC SDP offer, answer, or ice candidate
      const rtc = WebRTCService.getInstance(this.currentUserId, signal.senderId);
      rtc.handleIncomingSignalingMessage(signal);
    }
  }

  /**
   * Sends signaling payload to recipient via Local LAN hub
   */
  public static async sendSignal(signal: SignalingMessage): Promise<boolean> {
    try {
      const res = await fetch('/api/lan-signaling/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Discovers peers currently connected to the local Wi-Fi / Hotspot LAN
   */
  public static async getActiveLanPeers(): Promise<string[]> {
    try {
      const res = await fetch('/api/lan-signaling/peers');
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.peers) ? data.peers : [];
    } catch {
      return [];
    }
  }

  public disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch {}
      this.eventSource = null;
    }
    this.isConnected = false;
  }
}

