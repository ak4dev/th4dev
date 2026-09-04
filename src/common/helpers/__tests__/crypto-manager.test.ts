/* ==================================================
 * Crypto Manager Tests
 * ================================================== */

import { describe, it, expect, vi } from "vitest";
import {
  encryptToEnvelope,
  decryptFromEnvelope,
  isEncryptedEnvelope,
  isEncryptedFile,
  unsupportedFileMessage,
} from "../crypto-manager";
import type { EncryptedEnvelope } from "../crypto-manager";

/** The message the module must not leak past: no raw DOMException/TypeError. */
const GENERIC_FAILURE = "Incorrect password, or the file is corrupted.";
const MALFORMED = "This encrypted file is malformed.";
const UNSUPPORTED =
  "This encrypted file uses a newer format that this version of TH4 cannot open.";

/** A syntactically valid envelope to mutate one field of at a time. */
const baseEnvelope = (): EncryptedEnvelope => ({
  th4Encrypted: true,
  version: 1,
  kdf: "PBKDF2",
  iterations: 600_000,
  salt: btoa("0123456789abcdef"),
  iv: btoa("0123456789ab"),
  ciphertext: btoa("ciphertext-and-tag"),
});

/**
 * An envelope with fields overridden past the type — exactly what a file on
 * disk can contain once a caller asserts the parsed JSON into the type.
 */
const craft = (overrides: Record<string, unknown>): EncryptedEnvelope =>
  ({ ...baseEnvelope(), ...overrides }) as unknown as EncryptedEnvelope;

/** Same, but with a field removed rather than overridden. */
const withoutField = (field: string): EncryptedEnvelope =>
  Object.fromEntries(
    Object.entries(baseEnvelope()).filter(([k]) => k !== field),
  ) as unknown as EncryptedEnvelope;

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

/**
 * Builds an envelope the way an older build did, so backward compatibility is
 * tested against a real 250,000-iteration file rather than a re-encoding of
 * the current one.
 */
const legacyEnvelope = async (
  plaintext: string,
  password: string,
  iterations: number,
): Promise<EncryptedEnvelope> => {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoder.encode(plaintext),
  );
  return {
    th4Encrypted: true,
    version: 1,
    kdf: "PBKDF2",
    iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
};

describe("crypto-manager", () => {
  it("round-trips plaintext through encrypt/decrypt with the correct password", async () => {
    const plaintext = JSON.stringify({ sliders: { investmentA: 12345 } });
    const envelope = await encryptToEnvelope(plaintext, "correct horse");
    const decrypted = await decryptFromEnvelope(envelope, "correct horse");
    expect(decrypted).toBe(plaintext);
  });

  it("does not store the plaintext anywhere in the envelope", async () => {
    const plaintext = JSON.stringify({ secretNumber: 987654321 });
    const envelope = await encryptToEnvelope(plaintext, "pw");
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("987654321");
    expect(serialized).not.toContain("secretNumber");
  });

  it("produces a different salt/iv/ciphertext on every call (no key/nonce reuse)", async () => {
    const plaintext = JSON.stringify({ a: 1 });
    const e1 = await encryptToEnvelope(plaintext, "pw");
    const e2 = await encryptToEnvelope(plaintext, "pw");
    expect(e1.salt).not.toBe(e2.salt);
    expect(e1.iv).not.toBe(e2.iv);
    expect(e1.ciphertext).not.toBe(e2.ciphertext);
  });

  it("rejects decryption with the wrong password", async () => {
    const envelope = await encryptToEnvelope(JSON.stringify({ a: 1 }), "right");
    await expect(decryptFromEnvelope(envelope, "wrong")).rejects.toThrow();
  });

  it("rejects a tampered ciphertext (auth tag fails closed)", async () => {
    const envelope = await encryptToEnvelope(JSON.stringify({ a: 1 }), "pw");
    const tampered = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -4) + "abcd",
    };
    await expect(decryptFromEnvelope(tampered, "pw")).rejects.toThrow();
  });

  it("isEncryptedEnvelope identifies encrypted payloads and rejects plain state", async () => {
    const envelope = await encryptToEnvelope(JSON.stringify({ a: 1 }), "pw");
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    expect(isEncryptedEnvelope({ theme: "nord", sliders: {} })).toBe(false);
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope("not an object")).toBe(false);
  });
});

describe("encryptToEnvelope", () => {
  it("writes new files at the current OWASP work factor (600,000 iterations)", async () => {
    const envelope = await encryptToEnvelope(JSON.stringify({ a: 1 }), "pw");
    expect(envelope.iterations).toBe(600_000);
    expect(envelope.version).toBe(1);
    expect(envelope.kdf).toBe("PBKDF2");
  });
});

describe("isEncryptedEnvelope", () => {
  it("rejects an envelope whose iterations field is missing or not a number", () => {
    expect(isEncryptedEnvelope(baseEnvelope())).toBe(true);
    expect(isEncryptedEnvelope(withoutField("iterations"))).toBe(false);
    expect(isEncryptedEnvelope(craft({ iterations: "600000" }))).toBe(false);
    expect(isEncryptedEnvelope(craft({ iterations: null }))).toBe(false);
  });

  it("rejects an envelope this build cannot decrypt (unknown version or kdf)", () => {
    expect(isEncryptedEnvelope(craft({ version: 2 }))).toBe(false);
    expect(isEncryptedEnvelope(craft({ kdf: "Argon2id" }))).toBe(false);
  });
});

describe("isEncryptedFile", () => {
  it("still recognises an envelope from a future build as a TH4 encrypted file", () => {
    const future = craft({ version: 2, kdf: "Argon2id" });
    // Recognised as ours, so the UI can say "can't open this" instead of
    // falling through to the state guard and reporting "Invalid state file".
    expect(isEncryptedFile(future)).toBe(true);
    expect(isEncryptedEnvelope(future)).toBe(false);
  });

  it("rejects plain state, null and non-objects", () => {
    expect(isEncryptedFile({ theme: "nord", sliders: {} })).toBe(false);
    expect(isEncryptedFile(null)).toBe(false);
    expect(isEncryptedFile("not an object")).toBe(false);
    expect(isEncryptedFile({ th4Encrypted: "true" })).toBe(false);
  });
});

describe("unsupportedFileMessage", () => {
  it("blames the format for an unknown version or kdf", () => {
    expect(unsupportedFileMessage(craft({ version: 2 }))).toBe(UNSUPPORTED);
    expect(unsupportedFileMessage(craft({ kdf: "Argon2id" }))).toBe(
      UNSUPPORTED,
    );
  });

  it("blames the file for a version 1 envelope with fields missing or mistyped", () => {
    expect(unsupportedFileMessage(withoutField("salt"))).toBe(MALFORMED);
    expect(unsupportedFileMessage(withoutField("iterations"))).toBe(MALFORMED);
    expect(unsupportedFileMessage(craft({ iterations: "600000" }))).toBe(
      MALFORMED,
    );
  });
});

describe("decryptFromEnvelope validation", () => {
  it("rejects an out-of-range, fractional or missing iteration count without deriving a key", async () => {
    const importKey = vi.spyOn(crypto.subtle, "importKey");
    const deriveKey = vi.spyOn(crypto.subtle, "deriveKey");
    try {
      const bad: EncryptedEnvelope[] = [
        craft({ iterations: 1 }),
        craft({ iterations: 0 }),
        craft({ iterations: -1 }),
        craft({ iterations: 99_999 }),
        craft({ iterations: 5_000_000 }),
        craft({ iterations: 4e9 }),
        craft({ iterations: 250_000.5 }),
        craft({ iterations: Number.NaN }),
        craft({ iterations: "x" }),
        withoutField("iterations"),
      ];
      for (const envelope of bad) {
        await expect(decryptFromEnvelope(envelope, "pw")).rejects.toThrow(
          GENERIC_FAILURE,
        );
      }
      // The whole point of the bound: a crafted count must never reach PBKDF2.
      expect(importKey).not.toHaveBeenCalled();
      expect(deriveKey).not.toHaveBeenCalled();
    } finally {
      importKey.mockRestore();
      deriveKey.mockRestore();
    }
  });

  it("accepts the iteration counts on the boundary of the accepted range", async () => {
    // 100,000 and 2,000,000 are in range, so they get past validation and fail
    // later, on the ciphertext, with the same generic message. What matters is
    // that they are not rejected up front: the floor must stay below the
    // 250,000 older files were written with.
    const deriveKey = vi.spyOn(crypto.subtle, "deriveKey");
    try {
      await expect(
        decryptFromEnvelope(craft({ iterations: 100_000 }), "pw"),
      ).rejects.toThrow(GENERIC_FAILURE);
      expect(deriveKey).toHaveBeenCalledTimes(1);
    } finally {
      deriveKey.mockRestore();
    }
  });

  it("decrypts a 250,000-iteration envelope written before the work factor was raised", async () => {
    const plaintext = JSON.stringify({ sliders: { investmentA: 12345 } });
    const legacy = await legacyEnvelope(plaintext, "old password", 250_000);
    expect(legacy.iterations).toBe(250_000);
    expect(isEncryptedEnvelope(legacy)).toBe(true);
    await expect(decryptFromEnvelope(legacy, "old password")).resolves.toBe(
      plaintext,
    );
  });

  it("reports a non-base64 salt, iv or ciphertext as malformed rather than throwing a DOMException", async () => {
    for (const field of ["salt", "iv", "ciphertext"]) {
      await expect(
        decryptFromEnvelope(craft({ [field]: "***not-base64***" }), "pw"),
      ).rejects.toThrow(MALFORMED);
      await expect(
        decryptFromEnvelope(withoutField(field), "pw"),
      ).rejects.toThrow(MALFORMED);
    }
  });

  it("reports an unrecognised version or kdf with its own message", async () => {
    await expect(
      decryptFromEnvelope(craft({ version: 2 }), "pw"),
    ).rejects.toThrow(UNSUPPORTED);
    await expect(
      decryptFromEnvelope(craft({ kdf: "Argon2id" }), "pw"),
    ).rejects.toThrow(UNSUPPORTED);
    // Not the generic message, and not silently attempted as PBKDF2.
    await expect(
      decryptFromEnvelope(craft({ version: 2 }), "pw"),
    ).rejects.not.toThrow(GENERIC_FAILURE);
  });
});

describe("secure context requirement", () => {
  it("explains that encryption needs https instead of throwing on undefined", async () => {
    // crypto.subtle is absent over plain http (the Network URL `npm run dev`
    // prints), where the unguarded call died with "Cannot read properties of
    // undefined" and told the user nothing.
    const real = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: real.getRandomValues.bind(real),
    });
    try {
      await expect(encryptToEnvelope("{}", "pw")).rejects.toThrow(
        /secure context/i,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
