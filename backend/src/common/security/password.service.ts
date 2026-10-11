import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
const DEFAULT_N = 16_384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.derive(password, salt, KEY_LENGTH, DEFAULT_N, DEFAULT_R, DEFAULT_P);

    return [
      'scrypt',
      DEFAULT_N,
      DEFAULT_R,
      DEFAULT_P,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }

    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);

    if (![N, r, p].every((value) => Number.isSafeInteger(value) && value > 0)) {
      return false;
    }

    try {
      const salt = Buffer.from(saltRaw, 'base64url');
      const expected = Buffer.from(hashRaw, 'base64url');
      if (salt.length < 16 || expected.length < 32) {
        return false;
      }

      const actual = await this.derive(password, salt, expected.length, N, r, p);
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  private derive(
    password: string,
    salt: Buffer,
    keyLength: number,
    N: number,
    r: number,
    p: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(
        password,
        salt,
        keyLength,
        { N, r, p, maxmem: MAX_MEMORY },
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(derivedKey);
        },
      );
    });
  }
}
