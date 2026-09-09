import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptAesGcm(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptAesGcm(blob: Buffer, key: Buffer): Buffer {
  if (blob.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted payload is too short.");
  }
  const iv = blob.subarray(0, IV_LENGTH);
  const tag = blob.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const data = blob.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}
