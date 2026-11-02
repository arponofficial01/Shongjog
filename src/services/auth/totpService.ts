// RFC 6238 TOTP Cryptographic Service for Two-Factor Authentication
// Compatible with Google Authenticator, Microsoft Authenticator, 1Password, Authy

function base32Decode(str: string): Uint8Array {
  const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  for (let i = 0; i < clean.length; i++) {
    const val = base32chars.indexOf(clean.charAt(i));
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

export class TotpService {
  /**
   * Generates a random 16-character base32 secret suitable for Authenticator apps
   */
  public static generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let s = '';
    const array = new Uint8Array(16);
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(array);
      for (let i = 0; i < 16; i++) {
        s += chars.charAt(array[i] % chars.length);
      }
    } else {
      for (let i = 0; i < 16; i++) {
        s += chars.charAt(Math.floor(Math.random() * chars.length));
      }
    }
    return s;
  }

  /**
   * Generates a 6-digit TOTP code for the given base32 secret and time step offset
   */
  public static async generateCode(secretBase32: string, stepOffset = 0): Promise<string> {
    try {
      const keyBytes = base32Decode(secretBase32);
      if (keyBytes.length === 0) return '';
      const keyBuffer = keyBytes.buffer.slice(
        keyBytes.byteOffset,
        keyBytes.byteOffset + keyBytes.byteLength
      ) as ArrayBuffer;

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        keyBuffer,
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
      );

      const epoch = Math.floor(Date.now() / 1000);
      const timeStep = Math.floor(epoch / 30) + stepOffset;
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);
      view.setUint32(0, 0, false);
      view.setUint32(4, timeStep, false);

      const hmac = await window.crypto.subtle.sign('HMAC', cryptoKey, buffer);
      const hmacBytes = new Uint8Array(hmac);
      const offset = hmacBytes[hmacBytes.length - 1] & 0x0f;
      const binary =
        ((hmacBytes[offset] & 0x7f) << 24) |
        ((hmacBytes[offset + 1] & 0xff) << 16) |
        ((hmacBytes[offset + 2] & 0xff) << 8) |
        (hmacBytes[offset + 3] & 0xff);

      const otp = (binary % 1000000).toString().padStart(6, '0');
      return otp;
    } catch {
      return '';
    }
  }

  /**
   * Verifies a 6-digit user-entered TOTP code against the secret, allowing +/- 1 time-step clock drift
   */
  public static async verifyCode(secretBase32: string, userCode: string): Promise<boolean> {
    const cleanCode = (userCode || '').trim();
    if (!cleanCode || cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      return false;
    }
    for (const offset of [0, -1, 1]) {
      const expected = await this.generateCode(secretBase32, offset);
      if (expected && expected === cleanCode) {
        return true;
      }
    }
    return false;
  }

  /**
   * Extracts TOTP secret from user bio metadata or localStorage
   */
  public static extractTotpSecret(bio?: string): string | null {
    if (bio) {
      const match = bio.match(/__totp:([A-Za-z0-9]+)/);
      if (match && match[1]) {
        return match[1].toUpperCase();
      }
    }
    const local = typeof localStorage !== 'undefined' ? localStorage.getItem('shongjog_2fa_secret') : null;
    return local ? local.toUpperCase() : null;
  }
}

