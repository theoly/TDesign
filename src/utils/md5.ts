/**
 * 跨端通用的纯 JavaScript/TypeScript RFC 1321 MD5 消息摘要算法
 * 
 * 适用于 Webview、Tauri、Bun 与 Node 环境，零外部依赖。
 */

// 64 步变换所需的左移位数
const SHIFTS = [
  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,  7, 12, 17, 22,
  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,  5,  9, 14, 20,
  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,  4, 11, 16, 23,
  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21,  6, 10, 15, 21
];

// 64 步变换常数表 T[i] = floor(abs(sin(i + 1)) * 2^32)
const CONSTANTS = new Uint32Array(64);
for (let i = 0; i < 64; i++) {
  CONSTANTS[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
}

function leftRotate(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

/**
 * 将字符串编码为 UTF-8 字节数组
 */
export function stringToUtf8Bytes(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      // 代理对
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      bytes.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * Base64 字符串解码为 Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  // 去除可能的换行符与空白
  const clean = base64.replace(/[\s\r\n]+/g, '');
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(clean, 'base64'));
  }
  if (typeof atob !== 'undefined') {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  throw new Error('当前环境缺少 Base64 解码能力');
}

/**
 * 计算任意 Uint8Array 或 UTF-8 字符串的 MD5 哈希（32位小写十六进制字符串）
 */
export function computeMd5(input: string | Uint8Array): string {
  const message = typeof input === 'string' ? stringToUtf8Bytes(input) : input;
  const msgLen = message.length;

  // 1. 填充消息至 length ≡ 56 (mod 64)
  const remainder = msgLen % 64;
  const padLen = remainder < 56 ? 56 - remainder : 120 - remainder;
  const totalLen = msgLen + padLen + 8;

  const padded = new Uint8Array(totalLen);
  padded.set(message);
  padded[msgLen] = 0x80;

  // 2. 尾部追加 64 位原始长度（以比特位计数，低位在前小端序）
  const bitLength = msgLen * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLength >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLength / 0x100000000), true);

  // 3. 初始化缓冲区变量
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  // 4. 以 512-bit (64-byte) 为块进行分段迭代
  for (let offset = 0; offset < totalLen; offset += 64) {
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f = 0;
      let g = 0;

      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }

      const mIndex = offset + g * 4;
      const mVal = view.getUint32(mIndex, true);
      const temp = d;
      d = c;
      c = b;
      b = (b + leftRotate(a + f + CONSTANTS[i] + mVal, SHIFTS[i])) | 0;
      a = temp;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  // 5. 将 4 个 32-bit 字转为 32 位小端十六进制字符串
  function toHex(n: number): string {
    const v = new Uint8Array(4);
    const dv = new DataView(v.buffer);
    dv.setUint32(0, n, true);
    return Array.from(v)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return `${toHex(a0)}${toHex(b0)}${toHex(c0)}${toHex(d0)}`;
}

/**
 * 计算 Base64 图片数据的二进制 MD5
 */
export function computeBase64Md5(base64Data: string): string {
  const bytes = base64ToUint8Array(base64Data);
  return computeMd5(bytes);
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

export interface ImageInfoFromDataUrl {
  md5: string;
  ext: string;
  mimeType: string;
  base64: string;
  fileName: string;
  relPath: string;
}

/**
 * 从 DataURL 解析并计算出二进制 MD5 与规范化存储路径
 */
export function parseImageInfoFromDataUrl(dataUrl: string): ImageInfoFromDataUrl | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;

  const mimeType = m[1].toLowerCase();
  const base64 = m[2];
  const md5 = computeBase64Md5(base64);
  const ext = MIME_EXT[mimeType] || 'png';
  const fileName = `${md5}.${ext}`;
  const relPath = `assets/images/${fileName}`;

  return {
    md5,
    ext,
    mimeType,
    base64,
    fileName,
    relPath
  };
}
