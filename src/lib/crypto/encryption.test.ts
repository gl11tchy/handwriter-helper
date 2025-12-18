import { describe, it, expect, vi, beforeAll } from "vitest";
import {
  generateEncryptionKey,
  exportKeyToBase64,
  importKeyFromBase64,
  encryptData,
  decryptData,
  buildReportUrl,
  extractKeyFromFragment,
} from "./encryption";

// Mock window.location for URL-related tests
const mockLocation = {
  origin: "https://example.com",
  hash: "",
};

beforeAll(() => {
  vi.stubGlobal("location", mockLocation);
});

describe("generateEncryptionKey", () => {
  it("generates a valid CryptoKey", async () => {
    const key = await generateEncryptionKey();

    expect(key).toBeDefined();
    expect(key.type).toBe("secret");
    expect(key.algorithm.name).toBe("AES-GCM");
    expect(key.extractable).toBe(true);
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
  });

  it("generates different keys each time", async () => {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();

    const exported1 = await exportKeyToBase64(key1);
    const exported2 = await exportKeyToBase64(key2);

    expect(exported1).not.toBe(exported2);
  });
});

describe("exportKeyToBase64 and importKeyFromBase64", () => {
  it("exports key to base64url format", async () => {
    const key = await generateEncryptionKey();
    const exported = await exportKeyToBase64(key);

    expect(typeof exported).toBe("string");
    expect(exported.length).toBeGreaterThan(0);
    // Base64url should not contain + or / or =
    expect(exported).not.toMatch(/[+/=]/);
  });

  it("imports key from base64url and can decrypt", async () => {
    const originalKey = await generateEncryptionKey();
    const exported = await exportKeyToBase64(originalKey);

    // Encrypt with original key
    const plaintext = "Hello, World!";
    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, originalKey);

    // Import key and decrypt
    const importedKey = await importKeyFromBase64(exported);
    const decrypted = await decryptData(ciphertextB64, nonceB64, importedKey);

    expect(decrypted).toBe(plaintext);
  });

  it("handles keys with special base64url characters", async () => {
    // Generate multiple keys to increase chance of special characters
    for (let i = 0; i < 5; i++) {
      const key = await generateEncryptionKey();
      const exported = await exportKeyToBase64(key);
      const imported = await importKeyFromBase64(exported);

      // Test round-trip encryption
      const plaintext = "Test data";
      const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);
      const decrypted = await decryptData(ciphertextB64, nonceB64, imported);

      expect(decrypted).toBe(plaintext);
    }
  });
});

describe("encryptData and decryptData", () => {
  it("encrypts and decrypts string data correctly", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "Hello, World!";

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);
    const decrypted = await decryptData(ciphertextB64, nonceB64, key);

    expect(decrypted).toBe(plaintext);
  });

  it("encrypts and decrypts JSON data correctly", async () => {
    const key = await generateEncryptionKey();
    const data = {
      reportId: "test-123",
      score: 95,
      findings: [{ type: "missing_i_dot", line: 1 }],
    };
    const plaintext = JSON.stringify(data);

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);
    const decrypted = await decryptData(ciphertextB64, nonceB64, key);

    expect(JSON.parse(decrypted)).toEqual(data);
  });

  it("handles empty string", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "";

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);
    const decrypted = await decryptData(ciphertextB64, nonceB64, key);

    expect(decrypted).toBe(plaintext);
  });

  it("handles unicode characters", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "Hello 世界! 🎉 Ñoño";

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);
    const decrypted = await decryptData(ciphertextB64, nonceB64, key);

    expect(decrypted).toBe(plaintext);
  });

  it("handles large data", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "x".repeat(100000);

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);
    const decrypted = await decryptData(ciphertextB64, nonceB64, key);

    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (due to random nonce)", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "Hello, World!";

    const result1 = await encryptData(plaintext, key);
    const result2 = await encryptData(plaintext, key);

    expect(result1.ciphertextB64).not.toBe(result2.ciphertextB64);
    expect(result1.nonceB64).not.toBe(result2.nonceB64);
  });

  it("fails to decrypt with wrong key", async () => {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();
    const plaintext = "Hello, World!";

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key1);

    await expect(decryptData(ciphertextB64, nonceB64, key2)).rejects.toThrow();
  });

  it("fails to decrypt with wrong nonce", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "Hello, World!";

    const { ciphertextB64 } = await encryptData(plaintext, key);
    const { nonceB64: wrongNonce } = await encryptData("other", key);

    await expect(decryptData(ciphertextB64, wrongNonce, key)).rejects.toThrow();
  });

  it("fails to decrypt corrupted ciphertext", async () => {
    const key = await generateEncryptionKey();
    const plaintext = "Hello, World!";

    const { ciphertextB64, nonceB64 } = await encryptData(plaintext, key);

    // Corrupt the ciphertext
    const corrupted = "X" + ciphertextB64.slice(1);

    await expect(decryptData(corrupted, nonceB64, key)).rejects.toThrow();
  });
});

describe("buildReportUrl", () => {
  it("builds correct report URL with key in fragment", () => {
    const reportId = "abc123";
    const keyB64 = "testKey123";

    const url = buildReportUrl(reportId, keyB64);

    expect(url).toBe("https://example.com/r/abc123#k=testKey123");
  });

  it("handles special characters in key", () => {
    const reportId = "report-456";
    const keyB64 = "key-with_special";

    const url = buildReportUrl(reportId, keyB64);

    expect(url).toBe("https://example.com/r/report-456#k=key-with_special");
  });
});

describe("extractKeyFromFragment", () => {
  it("extracts key from URL fragment", () => {
    mockLocation.hash = "#k=mySecretKey123";

    const key = extractKeyFromFragment();

    expect(key).toBe("mySecretKey123");
  });

  it("returns null when no hash", () => {
    mockLocation.hash = "";

    const key = extractKeyFromFragment();

    expect(key).toBeNull();
  });

  it("returns null when no key parameter", () => {
    mockLocation.hash = "#other=value";

    const key = extractKeyFromFragment();

    expect(key).toBeNull();
  });

  it("handles hash with multiple parameters", () => {
    mockLocation.hash = "#other=value&k=theKey&another=param";

    const key = extractKeyFromFragment();

    expect(key).toBe("theKey");
  });

  it("handles key with special characters", () => {
    mockLocation.hash = "#k=key-with_special-chars123";

    const key = extractKeyFromFragment();

    expect(key).toBe("key-with_special-chars123");
  });
});
