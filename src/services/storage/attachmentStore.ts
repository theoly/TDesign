import { ProjectStorage } from './projectStorage';
import type { Asset } from '../../types/project';

/**
 * 会话附件落盘 (A2 / T-AE-32)。
 *
 * 消息中的参考图此前是 base64 dataUrl 直接挂在内存消息上。若把这种消息写进
 * 存档，单张图实测均值约 280KB（doc/archive/screenshots 9 张共 2.5MB），
 * 贴十来张就能耗尽 localStorage 全部配额。
 *
 * 因此：**图片写入 assets/images/，会话只保存 relPath**。
 * 顺带收益是附件纳入既有的 refCount 与 cleanupUnusedAssets 体系，
 * 并让 `Asset.relPath`（types/project.ts）这个本就为文件存储设计的字段
 * 与实现重新对齐——此前它指向一个不存在的文件。
 */

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg'
};

export interface ParsedDataUrl {
  mimeType: string;
  base64: string;
}

export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  return m ? { mimeType: m[1], base64: m[2] } : null;
}

/** base64 长度 → 近似字节数 */
export function approxBytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

export class AttachmentStore {
  constructor(private readonly storage: ProjectStorage) {}

  /**
   * 落盘一张附件，返回可直接写入 `Project.assets` 的记录。
   * 失败返回 null——附件写不进去不应阻断对话本身。
   */
  async save(name: string, dataUrl: string): Promise<Asset | null> {
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return null;

    const ext = MIME_EXT[parsed.mimeType] ?? 'bin';
    const id = `asset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const relPath = `assets/images/${id}.${ext}`;

    try {
      await this.storage.ensureDir('assets/images');
      await this.storage.writeBinary(relPath, parsed.base64);
    } catch (e) {
      console.warn('[attachment] 落盘失败，本轮附件不入库', e);
      return null;
    }

    return {
      id,
      name,
      type: parsed.mimeType === 'image/svg+xml' ? 'svg_icon' : 'image',
      mimeType: parsed.mimeType,
      source: 'upload',
      relPath,
      refCount: 0
    };
  }
}
