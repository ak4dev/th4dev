/* ==================================================
 * Crypto Manager
 *
 * Password-based encryption for exported state files, using WebCrypto
 * (PBKDF2 key derivation + AES-GCM authenticated encryption). Nothing
 * here ever leaves the browser — there is no server component.
 * ================================================== */

/**
 * Work factor used for files written by this build. OWASP's Password Storage
 * Cheat Sheet has recommended 600,000 for PBKDF2-HMAC-SHA256 since 2023.
 * Raising it is backward compatible: every envelope records the count it was
 * written with, and decryption derives with that recorded count.
 */
const PBKDF2_ITERATIONS = 600_000;

/**
 * Bounds on the iteration count accepted *from a file*. That count is
 * attacker-controlled input, so it is validated rather than trusted:
 *  - without a ceiling, a crafted envelope grinds PBKDF2 for hours behind a
 *    "Working…" dialog (the higher the honest work factor, the worse this is);
 *  - without a floor, a file could quietly downgrade the work factor.
 * The floor sits below the 250,000 this app shipped with, so files written
 * before the raise above still open.
 */
const MIN_PBKDF2_ITERATIONS = 100_000;
const MAX_PBKDF2_ITERATIONS = 2_000_000;

const SALT_BYTES = 16;
const IV_BYTES = 12;
const ENVELOPE_VERSION = 1;
const ENVELOPE_KDF = "PBKDF2";

/**
 * Shown for a wrong password, and for corrupt input we cannot distinguish
 * from one without telling an attacker which of the two it was.
 */
const DECRYPTION_FAILED_MESSAGE =
  "Incorrect password, or the file is corrupted.";

/** Shown when the envelope's own fields are unreadable, before any password is tried. */
const MALFORMED_ENVELOPE_MESSAGE = "This encrypted file is malformed.";

/** Shown when the file is recognisably a TH4 export that this build cannot read. */
const UNSUPPORTED_ENVELOPE_MESSAGE =
  "This encrypted file uses a newer format that this version of TH4 cannot open.";

/**
 * The marker every encrypted export carries, whatever its envelope version.
 * Recognising this separately from the full envelope shape is what lets the
 * UI say "encrypted file this build can't read" instead of "invalid state
 * file" when it meets a future format.
 */
export interface EncryptedFile {
  th4Encrypted: true;
}

/** Shape of a version 1 encrypted export, written in place of the raw JSON state. */
export interface EncryptedEnvelope extends EncryptedFile {
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

/**
 * "Is this a TH4 encrypted export at all?" — the marker only, deliberately
 * blind to version and payload so that an envelope from a future build is
 * still recognised as one of ours.
 */
export function isEncryptedFile(value: unknown): value is EncryptedFile {
  if (typeof value !== "object" || value === null) return false;
  return (value as Record<string, unknown>)["th4Encrypted"] === true;
}

/**
 * "Is this an envelope *this build* can decrypt?" — the full version 1 shape.
 * Every field the type promises is checked, including the ones decryption
 * feeds straight to WebCrypto.
 */
export function isEncryptedEnvelope(
  value: unknown,
): value is EncryptedEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    isEncryptedFile(value) &&
    v["version"] === ENVELOPE_VERSION &&
    v["kdf"] === ENVELOPE_KDF &&
    typeof v["iterations"] === "number" &&
    typeof v["salt"] === "string" &&
    typeof v["iv"] === "string" &&
    typeof v["ciphertext"] === "string"
  );
}

/**
 * Why an encrypted file cannot be opened here — call only once
 * `isEncryptedEnvelope` has said no. A file that claims to be a version 1
 * PBKDF2 envelope yet fails that guard is damaged; anything else announces a
 * format some other build wrote. Keeping this next to the guard is what stops
 * either case from falling through to the plain-state check and being reported
 * as "invalid state file".
 */
export function unsupportedFileMessage(file: EncryptedFile): string {
  const v: Partial<EncryptedEnvelope> = file;
  return v.version === ENVELOPE_VERSION && v.kdf === ENVELOPE_KDF
    ? MALFORMED_ENVELOPE_MESSAGE
    : UNSUPPORTED_ENVELOPE_MESSAGE;
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

/**
 * Decodes one base64 envelope field, turning atob's DOMException into a
 * message a user can act on. The check lives here rather than as a regex in
 * the type guard because no regex agrees with atob: `/^[A-Za-z0-9+/]+=*$/`
 * accepts strings atob rejects (a length that is not a multiple of four) and
 * rejects whitespace atob legally ignores.
 */
function decodeBase64OrThrow(b64: string, field: string): Uint8Array {
  try {
    return base64ToBuf(b64);
  } catch {
    throw new Error(MALFORMED_ENVELOPE_MESSAGE, {
      cause: `invalid base64 in envelope field "${field}"`,
    });
  }
}

/**
 * `crypto.subtle` exists only in a secure context, so it is undefined when the
 * app is opened over plain http — the Network URL `npm run dev` prints, or a
 * self-hosted build without TLS. Without this the first call fails with
 * "Cannot read properties of undefined", which tells the user nothing about
 * the actual problem or how to fix it.
 */
function requireSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Encryption needs a secure context. Open this page over https (or on localhost) and try again.",
      { cause: "crypto.subtle is unavailable" },
    );
  }
  return subtle;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = requireSubtleCrypto();
  const keyMaterial = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
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
  const ciphertext = await requireSubtleCrypto().encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    th4Encrypted: true,
    version: ENVELOPE_VERSION,
    kdf: ENVELOPE_KDF,
    iterations: PBKDF2_ITERATIONS,
    salt: bufToBase64(salt),
    iv: bufToBase64(iv),
    ciphertext: bufToBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypts an envelope with a password, returning the original JSON string.
 *
 * Everything the envelope carries is validated before WebCrypto sees it, so a
 * corrupt or crafted file produces one of this module's messages rather than a
 * raw DOMException — or, in the case of the iteration count, rather than hours
 * of key derivation. Throws if the password is wrong or the ciphertext has been
 * tampered with: AES-GCM authentication fails closed rather than returning
 * garbage.
 */
export async function decryptFromEnvelope(
  envelope: EncryptedEnvelope,
  password: string,
): Promise<string> {
  // Defensive: callers assert this type over JSON parsed from disk.
  if (envelope.version !== ENVELOPE_VERSION || envelope.kdf !== ENVELOPE_KDF) {
    throw new Error(UNSUPPORTED_ENVELOPE_MESSAGE);
  }

  const { iterations } = envelope;
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    throw new Error(DECRYPTION_FAILED_MESSAGE);
  }

  const salt = decodeBase64OrThrow(envelope.salt, "salt");
  const iv = decodeBase64OrThrow(envelope.iv, "iv");
  const ciphertext = decodeBase64OrThrow(envelope.ciphertext, "ciphertext");

  // deriveKey is deliberately outside the try below: a failure here means
  // WebCrypto itself is unavailable (an insecure context, say), and reporting
  // that as a corrupt file would send the user hunting for the wrong problem.
  const key = await deriveKey(password, salt, iterations);
  try {
    const plainBuf = await requireSubtleCrypto().decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error(DECRYPTION_FAILED_MESSAGE);
  }
}
