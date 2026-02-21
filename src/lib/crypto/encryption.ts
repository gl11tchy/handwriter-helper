// Report encryption using AES-GCM
// In the standard flow the key stays in the URL fragment.
// Email-notification flows may include the key during report upload.

const ALGORITHM = "AES-GCM";

// Base64URL encoding/decoding utilities
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12; // 96 bits for AES-GCM

// Generate a random encryption key
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable for URL encoding
    ["encrypt", "decrypt"]
  );
}

// Export key to base64url for URL fragment
export async function exportKeyToBase64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return arrayBufferToBase64Url(raw);
}

// Import key from base64url (from URL fragment)
export async function importKeyFromBase64(keyB64: string): Promise<CryptoKey> {
  const raw = base64UrlToArrayBuffer(keyB64);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["decrypt"]
  );
}

// Encrypt data with AES-GCM
export async function encryptData(
  data: string,
  key: CryptoKey
): Promise<{ ciphertextB64: string; nonceB64: string }> {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const encoded = new TextEncoder().encode(data);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: nonce },
    key,
    encoded
  );

  return {
    ciphertextB64: arrayBufferToBase64Url(ciphertext),
    nonceB64: arrayBufferToBase64Url(nonce.buffer),
  };
}

// Decrypt data with AES-GCM
export async function decryptData(
  ciphertextB64: string,
  nonceB64: string,
  key: CryptoKey
): Promise<string> {
  const ciphertext = base64UrlToArrayBuffer(ciphertextB64);
  const nonce = base64UrlToArrayBuffer(nonceB64);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: nonce },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// Generate report URL with encryption key in fragment
export function buildReportUrl(reportId: string, keyB64: string): string {
  const base = window.location.origin;
  return `${base}/r/${reportId}#k=${keyB64}`;
}

// Extract encryption key from URL fragment
export function extractKeyFromFragment(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.slice(1));
  return params.get("k");
}
