/**
 * CryptoHelper.js
 * Cryptographic helper utilizing the native Web Crypto API (AES-GCM + PBKDF2 key derivation).
 * Securely encrypts and decrypts local storage cache payloads to prevent plaintext data harvesting.
 */

const PASSWORD = "restaurant-mvp-secure-salt-2026-key-rotation-phrase";
const SALT = new TextEncoder().encode("restaurant-discovery-salt-vector-key");

let cachedCryptoKey = null;

/**
 * Derives a 256-bit AES-GCM key deterministically using PBKDF2.
 * Caches the key in memory to avoid repeated derivations.
 */
async function getCryptoKey() {
  if (cachedCryptoKey) return cachedCryptoKey;

  try {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(PASSWORD),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );

    cachedCryptoKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: SALT,
        iterations: 100000,
        hash: "SHA-256"
      },
      passwordKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    return cachedCryptoKey;
  } catch (error) {
    console.error("Failed to derive crypto key:", error);
    throw new Error("Cryptography initialization error");
  }
}

/**
 * Helper to convert Uint8Array to Base64.
 */
function uint8ArrayToBase64(arr) {
  let binary = "";
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

/**
 * Helper to convert Base64 to Uint8Array.
 */
function base64ToUint8Array(base64Str) {
  const binary = atob(base64Str);
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

/**
 * Encrypts a plaintext string to an AES-GCM encrypted Base64 string.
 */
export async function encryptData(plaintext) {
  try {
    const key = await getCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );

    const encryptedBytes = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedBytes.length);
    combined.set(iv, 0);
    combined.set(encryptedBytes, iv.length);

    return uint8ArrayToBase64(combined);
  } catch (error) {
    console.error("Encryption failed:", error);
    throw error;
  }
}

/**
 * Decrypts an AES-GCM encrypted Base64 string back to plaintext.
 */
export async function decryptData(ciphertextBase64) {
  try {
    const key = await getCryptoKey();
    const combined = base64ToUint8Array(ciphertextBase64);

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error("Decryption failed:", error);
    throw error;
  }
}
