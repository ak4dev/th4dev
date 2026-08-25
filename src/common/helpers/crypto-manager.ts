/* ==================================================
 * Crypto Manager
 *
 * Password-based encryption for exported state files, using WebCrypto
 * (PBKDF2 key derivation + AES-GCM authenticated encryption). Nothing
 * here ever leaves the browser — there is no server component.
 * ================================================== */

const PBKDF2_ITERATIONS = 250_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ENVELOPE_VERSION = 1;

/** Shape of an encrypted export file, written in place of the raw JSON state. */
export interface EncryptedEnvelope {
  th4Encrypted: true;
  version: 1;
  kdf: "PBKDF2";
  iterations: number;
  /** base64-encoded PBKDF2 salt */
  salt: string;
  /** base64-encoded AES-GCM IV */
  iv: string;
  /** base64-encoded ciphertext (includes GCM auth tag) */
  ciphertext: string;
}

/** Runtime type guard distinguishing an encrypted export from a plain TH4State file. */
export function isEncryptedEnvelope(
  value: unknown,
): value is EncryptedEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v["th4Encrypted"] === true &&
    typeof v["salt"] === "string" &&
    typeof v["iv"] === "string" &&
    typeof v["ciphertext"] === "string"
  );
}

function bufToBase64(buf: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
  return buf;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypts a JSON string with a password, returning a self-contained envelope. */
export async function encryptToEnvelope(
  plaintext: string,
  password: string,
): Promise<EncryptedEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    th4Encrypted: true,
    version: ENVELOPE_VERSION,
    kdf: "PBKDF2",
    iterations: PBKDF2_ITERATIONS,
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    ciphertext: bufToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypts an envelope with a password, returning the original JSON string.
 * Throws if the password is wrong or the ciphertext has been tampered with —
 * AES-GCM authentication fails closed rather than returning garbage.
 */
export async function decryptFromEnvelope(
  envelope: EncryptedEnvelope,
  password: string,
): Promise<string> {
  const salt = base64ToBuf(envelope.salt);
  const iv = base64ToBuf(envelope.iv);
  const key = await deriveKey(password, salt, envelope.iterations);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      base64ToBuf(envelope.ciphertext) as BufferSource,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error("Incorrect password, or the file is corrupted.");
  }
}
