/* ==================================================
 * Crypto Manager Tests
 * ================================================== */

import { describe, it, expect } from "vitest";
import {
  encryptToEnvelope,
  decryptFromEnvelope,
  isEncryptedEnvelope,
} from "../crypto-manager";

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
