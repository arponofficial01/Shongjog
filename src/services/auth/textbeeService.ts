export interface TextbeeConfig {
  apiKey: string;
  deviceId?: string;
}

export class TextbeeService {
  /**
   * Checks if TextBee credentials exist in environment variables or localStorage.
   */
  public static isConfigured(): boolean {
    const key =
      localStorage.getItem('shongjog_textbee_api_key') ||
      import.meta.env.VITE_TEXTBEE_API_KEY ||
      '';
    return Boolean(key && key.trim().length > 5 && !key.includes('placeholder'));
  }

  public static getApiKey(): string {
    return (
      localStorage.getItem('shongjog_textbee_api_key') ||
      import.meta.env.VITE_TEXTBEE_API_KEY ||
      ''
    );
  }

  public static getDeviceId(): string | undefined {
    return (
      localStorage.getItem('shongjog_textbee_device_id') ||
      import.meta.env.VITE_TEXTBEE_DEVICE_ID ||
      undefined
    );
  }

  public static saveConfig(apiKey: string, deviceId?: string): void {
    localStorage.setItem('shongjog_textbee_api_key', apiKey.trim());
    if (deviceId) {
      localStorage.setItem('shongjog_textbee_device_id', deviceId.trim());
    } else {
      localStorage.removeItem('shongjog_textbee_device_id');
    }
  }

  /**
   * Dispatches a real SMS OTP to the recipient phone number via TextBee Android SIM Gateway.
   */
  public static async sendOtp(
    formattedPhone: string,
    otpCode: string
  ): Promise<{ success: boolean; error?: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: 'TextBee API Key missing. Please set VITE_TEXTBEE_API_KEY in .env' };
    }

    try {
      const deviceId = this.getDeviceId();
      const message = `[Shongjog] Your verification code is: ${otpCode}. Valid for 5 minutes.`;

      // Call our internal backend proxy route (/api/send-sms) to avoid browser CORS
      const res = await fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          deviceId,
          recipients: [formattedPhone],
          message,
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        return {
          success: false,
          error: 'SMS gateway service unavailable. Instant verification code provided.',
        };
      }

      if (!res.ok) {
        const errorMsg =
          data.error ||
          data.message ||
          (Array.isArray(data.errors) ? data.errors.join(', ') : 'SMS gateway service unavailable. Instant verification code provided.');
        return { success: false, error: errorMsg };
      }

      return { success: true };
    } catch (err: any) {
      console.warn('TextBee Send SMS Error:', err);
      return {
        success: false,
        error: 'Network error reaching SMS gateway. Instant verification code provided.',
      };
    }
  }
}
