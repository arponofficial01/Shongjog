// Native & Web Real Push Notification Service
// Provides real hardware & system notifications for incoming messages, audio/video calls, and alerts.
// Zero-mock, production-grade notifications using native Web Notification API and Service Worker Push.

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

export class NotificationService {
  private static instance: NotificationService | null = null;
  private static audioCtx: AudioContext | null = null;

  public static getInstance(): NotificationService {
    if (!this.instance) {
      this.instance = new NotificationService();
    }
    return this.instance;
  }

  /**
   * Checks if Notification API is supported in the current environment
   */
  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Returns current permission status ('default', 'granted', 'denied')
   */
  public static getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Requests native notification permissions from the user/OS
   */
  public static async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch {
      return Notification.permission;
    }
  }

  /**
   * Dispatches a native push notification with icon, vibration and click action
   */
  public static async showNotification(
    title: string,
    options: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      data?: any;
      silent?: boolean;
      vibrate?: number[];
      onClick?: () => void;
    } = {}
  ): Promise<void> {
    if (!this.isSupported()) return;

    if (Notification.permission === 'default') {
      const granted = await this.requestPermission();
      if (granted !== 'granted') return;
    }

    if (Notification.permission !== 'granted') return;

    const notifOptions: NotificationOptions = {
      body: options.body || '',
      icon: options.icon || '/favicon.svg',
      badge: options.badge || '/favicon.svg',
      tag: options.tag || 'shongjog_notification',
      data: options.data,
      silent: Boolean(options.silent),
    };

    // Try service worker registration first for reliable mobile/background delivery
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(title, notifOptions);
          return;
        }
      } catch {
        // Fallback to standard Notification constructor
      }
    }

    try {
      const notif = new Notification(title, notifOptions);
      if (options.onClick) {
        notif.onclick = () => {
          try {
            window.focus();
          } catch {}
          options.onClick?.();
          notif.close();
        };
      }
    } catch (e) {
      console.warn('Native notification error:', e);
    }
  }

  /**
   * Plays a distinct, elegant incoming message chime
   */
  public static playMessageSound(): void {
    try {
      if (localStorage.getItem('shongjog_sound_fx') === 'false') return;
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, this.audioCtx.currentTime + 0.12); // E6

      gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.3);

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([15, 30, 20]);
      }
    } catch {
      // Audio autoplay may be guarded until first gesture
    }
  }

  /**
   * Notifies user of an incoming chat message when window is not focused or is backgrounded
   */
  public static notifyIncomingMessage(
    senderName: string,
    messageContent: string,
    avatarUrl?: string,
    onSelectChat?: () => void
  ): void {
    this.playMessageSound();

    // Only display OS notification if the document is backgrounded or tab is inactive
    const isHidden = typeof document !== 'undefined' && (document.hidden || !document.hasFocus());
    if (isHidden) {
      this.showNotification(`💬 ${senderName}`, {
        body: messageContent.length > 80 ? messageContent.slice(0, 80) + '...' : messageContent,
        icon: avatarUrl || '/favicon.svg',
        tag: `msg_${senderName}`,
        onClick: onSelectChat,
      });
    }
  }

  /**
   * Notifies user of an incoming high-priority voice/video call with phone vibration pattern
   */
  public static notifyIncomingCall(
    callerName: string,
    callType: 'audio' | 'video' = 'audio',
    onAnswer?: () => void
  ): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([300, 200, 300, 200, 500]);
    }

    this.showNotification(`📞 Incoming ${callType === 'video' ? 'Video' : 'Voice'} Call`, {
      body: `${callerName} is calling you on Shongjog...`,
      icon: '/favicon.svg',
      tag: 'shongjog_active_call',
      onClick: () => {
        try {
          window.focus();
        } catch {}
        onAnswer?.();
      },
    });
  }
}

