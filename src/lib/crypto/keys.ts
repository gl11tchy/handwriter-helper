// Keyholder keypair management using Web Crypto API
// Uses ECDSA with P-256 curve for compact signatures

import type { AssignmentPayload, AssignmentToken } from "@/types";

const ALGORITHM = {
  name: "ECDSA",
  namedCurve: "P-256",
};

const SIGN_ALGORITHM = {
  name: "ECDSA",
  hash: "SHA-256",
};

const DB_NAME = "handwriter-helper-keys";
const STORE_NAME = "keypair";
const KEY_ID = "keyholder-primary";

// IndexedDB helpers
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

// Generate a new keypair and store in IndexedDB
export async function generateKeyPair(): Promise<{
  publicKeyB64: string;
  createdAt: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    ALGORITHM,
    false, // non-extractable private key
    ["sign", "verify"]
  );

  // Export public key for sharing
  const publicKeyRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const publicKeyB64 = arrayBufferToBase64Url(publicKeyRaw);
  const createdAt = new Date().toISOString();

  // Store in IndexedDB
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.put({
      id: KEY_ID,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      publicKeyB64,
      createdAt,
    });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
  return { publicKeyB64, createdAt };
}

// Load existing keypair from IndexedDB
export async function loadKeyPair(): Promise<{
  publicKeyB64: string;
  createdAt: string;
  hasPrivateKey: boolean;
} | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const result = await new Promise<{
      privateKey: CryptoKey;
      publicKey: CryptoKey;
      publicKeyB64: string;
      createdAt: string;
    } | null>((resolve, reject) => {
      const request = store.get(KEY_ID);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    db.close();

    if (!result) return null;

    return {
      publicKeyB64: result.publicKeyB64,
      createdAt: result.createdAt,
      hasPrivateKey: !!result.privateKey,
    };
  } catch {
    return null;
  }
}

// Get the private key for signing
async function getPrivateKey(): Promise<CryptoKey | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    const result = await new Promise<{ privateKey: CryptoKey } | null>(
      (resolve, reject) => {
        const request = store.get(KEY_ID);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      }
    );

    db.close();
    return result?.privateKey || null;
  } catch {
    return null;
  }
}

// Reset/delete the keypair
export async function resetKeyPair(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  await new Promise<void>((resolve, reject) => {
    const request = store.delete(KEY_ID);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  db.close();
}

// Sign an assignment payload and create a token
export async function signAssignment(
  payload: AssignmentPayload
): Promise<AssignmentToken> {
  const privateKey = await getPrivateKey();
  if (!privateKey) {
    throw new Error("No private key found. Generate a keypair first.");
  }

  const keyInfo = await loadKeyPair();
  if (!keyInfo) {
    throw new Error("No public key found. Generate a keypair first.");
  }

  // Canonicalize JSON for signing
  const payloadJson = canonicalizeJson(payload);
  const payloadB64 = stringToBase64Url(payloadJson);

  // Sign the payload
  const signature = await crypto.subtle.sign(
    SIGN_ALGORITHM,
    privateKey,
    new TextEncoder().encode(payloadJson)
  );

  const sigB64 = arrayBufferToBase64Url(signature);

  return {
    payloadB64,
    sigB64,
    pubB64: keyInfo.publicKeyB64,
  };
}

// Verify an assignment token signature
export async function verifyAssignmentToken(
  token: AssignmentToken
): Promise<{ valid: boolean; payload: AssignmentPayload | null }> {
  try {
    // Import the public key from the token
    const publicKeyRaw = base64UrlToArrayBuffer(token.pubB64);
    const publicKey = await crypto.subtle.importKey(
      "spki",
      publicKeyRaw,
      ALGORITHM,
      false,
      ["verify"]
    );

    // Decode and verify
    const payloadJson = base64UrlToString(token.payloadB64);
    const signature = base64UrlToArrayBuffer(token.sigB64);

    const valid = await crypto.subtle.verify(
      SIGN_ALGORITHM,
      publicKey,
      signature,
      new TextEncoder().encode(payloadJson)
    );

    if (!valid) {
      return { valid: false, payload: null };
    }

    const payload = JSON.parse(payloadJson) as AssignmentPayload;
    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null };
  }
}

// Parse an assignment token from URL-safe string
export function parseAssignmentToken(tokenString: string): AssignmentToken | null {
  try {
    const decoded = base64UrlToString(tokenString);
    const token = JSON.parse(decoded) as AssignmentToken;
    if (!token.payloadB64 || !token.sigB64 || !token.pubB64) {
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

// Serialize an assignment token to URL-safe string
export function serializeAssignmentToken(token: AssignmentToken): string {
  return stringToBase64Url(JSON.stringify(token));
}

// Decode just the payload from a token (without verification)
export function decodePayloadUnsafe(token: AssignmentToken): AssignmentPayload | null {
  try {
    const payloadJson = base64UrlToString(token.payloadB64);
    return JSON.parse(payloadJson) as AssignmentPayload;
  } catch {
    return null;
  }
}

// Canonicalize JSON for consistent signing
function canonicalizeJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

// Base64URL encoding/decoding utilities
export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function stringToBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  return arrayBufferToBase64Url(bytes.buffer);
}

export function base64UrlToString(base64url: string): string {
  const buffer = base64UrlToArrayBuffer(base64url);
  return new TextDecoder().decode(buffer);
}
