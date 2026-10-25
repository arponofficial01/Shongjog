// Cryptographic service using native browser Web Crypto API (SubtleCrypto)
// Implements ECDSA (P-256) for digital signatures / integrity verification
// and AES-GCM (256-bit) for payload encryption

export interface KeyPairExport {
  publicKeyJwk: JsonWebKey;
  privateKeyJwk: JsonWebKey;
  publicKeyBase64: string;
}

const ECDSA_KEY_STORAGE = 'contact_app_ecdsa_keys';

export class CryptoService {
  private static cachedSignKeyPair: CryptoKeyPair | null = null;
  private static cachedPublicKeyString: string | null = null;

  /**
   * Initializes or loads the device identity ECDSA key pair from local storage.
   */
  public static async getOrCreateIdentityKeyPair(): Promise<{
    keyPair: CryptoKeyPair;
    publicKeyBase64: string;
  }> {
    if (this.cachedSignKeyPair && this.cachedPublicKeyString) {
      return {
        keyPair: this.cachedSignKeyPair,
        publicKeyBase64: this.cachedPublicKeyString,
      };
    }

    const saved = localStorage.getItem(ECDSA_KEY_STORAGE);
    if (saved) {
      try {
        const parsed: KeyPairExport = JSON.parse(saved);
        const privateKey = await window.crypto.subtle.importKey(
          'jwk',
          parsed.privateKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['sign']
        );
        const publicKey = await window.crypto.subtle.importKey(
          'jwk',
          parsed.publicKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          true,
          ['verify']
        );
        this.cachedSignKeyPair = { privateKey, publicKey };
        this.cachedPublicKeyString = parsed.publicKeyBase64;
        return {
          keyPair: this.cachedSignKeyPair,
          publicKeyBase64: this.cachedPublicKeyString,
        };
      } catch (err) {
        console.warn('Could not restore cached cryptographic keys, generating fresh keys', err);
      }
    }

    // Generate fresh P-256 ECDSA key pair
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['sign', 'verify']
    );

    const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    const publicKeyRaw = await window.crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyBase64 = this.arrayBufferToBase64(publicKeyRaw);

    const storageObj: KeyPairExport = {
      privateKeyJwk,
      publicKeyJwk,
      publicKeyBase64,
    };
    localStorage.setItem(ECDSA_KEY_STORAGE, JSON.stringify(storageObj));

    this.cachedSignKeyPair = keyPair;
    this.cachedPublicKeyString = publicKeyBase64;

    return { keyPair, publicKeyBase64 };
  }

  /**
   * Signs a message payload with the device private key.
   */
  public static async signPayload(payloadString: string): Promise<string> {
    const { keyPair } = await this.getOrCreateIdentityKeyPair();
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);

    const signature = await window.crypto.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      keyPair.privateKey,
      data
    );

    return this.arrayBufferToBase64(signature);
  }

  /**
   * Verifies a payload signature using the sender's public key (in base64).
   */
  public static async verifyPayload(
    payloadString: string,
    signatureBase64: string,
    publicKeyBase64: string
  ): Promise<boolean> {
    try {
      const publicKeyBuffer = this.base64ToArrayBuffer(publicKeyBase64);
      const signatureBuffer = this.base64ToArrayBuffer(signatureBase64);
      const encoder = new TextEncoder();
      const data = encoder.encode(payloadString);

      const publicKey = await window.crypto.subtle.importKey(
        'raw',
        publicKeyBuffer,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      return await window.crypto.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        publicKey,
        signatureBuffer,
        data
      );
    } catch (e) {
      console.error('Signature verification failed', e);
      return false;
    }
  }

  /**
   * Encrypts plaintext using AES-GCM (256-bit) with an initialization vector (IV).
   */
  public static async encryptString(plaintext: string, secretKeyHex: string): Promise<{
    ciphertextBase64: string;
    ivBase64: string;
  }> {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const keyData = this.hexToArrayBuffer(secretKeyHex);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      'AES-GCM',
      false,
      ['encrypt']
    );

    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      cryptoKey,
      encoder.encode(plaintext)
    );

    return {
      ciphertextBase64: this.arrayBufferToBase64(ciphertext),
      ivBase64: this.arrayBufferToBase64(iv),
    };
  }

  /**
   * Decrypts ciphertext using AES-GCM.
   */
  public static async decryptString(
    ciphertextBase64: string,
    ivBase64: string,
    secretKeyHex: string
  ): Promise<string> {
    const decoder = new TextDecoder();
    const ciphertext = this.base64ToArrayBuffer(ciphertextBase64);
    const iv = this.base64ToArrayBuffer(ivBase64);
    const keyData = this.hexToArrayBuffer(secretKeyHex);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyData,
      'AES-GCM',
      false,
      ['decrypt']
    );

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      cryptoKey,
      ciphertext
    );

    return decoder.decode(decrypted);
  }

  // --- Utility functions ---
  public static arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  public static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  public static hexToArrayBuffer(hex: string): ArrayBuffer {
    const cleanHex = hex.replace(/[^0-9a-fA-F]/g, '').padEnd(64, '0').slice(0, 64);
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes.buffer;
  }

  /**
   * Generates a unique secure device identifier.
   */
  public static getOrCreateDeviceId(): string {
    const key = 'contact_app_device_id';
    let deviceId = localStorage.getItem(key);
    if (!deviceId) {
      deviceId = 'dev_' + crypto.randomUUID();
      localStorage.setItem(key, deviceId);
    }
    return deviceId;
  }
}
