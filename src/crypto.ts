
import crypto from 'crypto';
export type KdfParams = { N: number; r: number; p: number; dkLen: number };
export async function deriveKek(password: string, salt: Buffer, params: KdfParams): Promise<Buffer> {
  // Estimate scrypt memory requirement and provide a generous maxmem to avoid OpenSSL default 32MiB cap
  // Memory ≈ 128 * N * r bytes
  const estimated = 128 * params.N * params.r;
  const baseMax = 64 * 1024 * 1024; // 64 MiB floor
  const tryOnce = (maxmem: number) => new Promise<Buffer>((res, rej) => {
    crypto.scrypt(password, salt, params.dkLen, { N: params.N, r: params.r, p: params.p, maxmem }, (err, key) => {
      if (err) rej(err); else res(key as Buffer);
    });
  });
  try {
    return await tryOnce(Math.max(baseMax, estimated * 2));
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (/memory limit exceeded/i.test(msg) || /ERR_CRYPTO_SCRYPT_INVALID_PARAMETER/i.test(String(e?.code || ''))) {
      // Retry with a higher cap
      return await tryOnce(Math.max(baseMax * 4, estimated * 8));
    }
    throw e;
  }
}
export function randomBytes(n: number): Buffer { return crypto.randomBytes(n); }
export function encryptAesGcm(key: Buffer, plaintext: Buffer, aad?: Buffer) {
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ct, iv, tag };
}
export function decryptAesGcm(key: Buffer, iv: Buffer, tag: Buffer, ct: Buffer, aad?: Buffer): Buffer {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt;
}
