import { invoke, isTauri } from '@tauri-apps/api/core';
import { downloadBlob } from './exportRenderer';

/**
 * 导出文件的保存通道 (doc/feature/export-save-dialog/spec.md)
 *
 * 桌面端弹系统保存对话框由用户选位置，并回传真实落盘路径供反馈；
 * 浏览器环境退回 `<a download>`，此时拿不到路径，反馈里只报文件名。
 */

export type SaveStatus = 'saved' | 'canceled' | 'downloaded';

export interface SaveExportResult {
  status: SaveStatus;
  /** 桌面端保存成功时的绝对路径；浏览器下载时为 undefined */
  path?: string;
  fileName: string;
}

export interface SaveExportRequest {
  /** 建议文件名，含扩展名 */
  fileName: string;
  /** 文件字节 */
  bytes: Uint8Array;
  mimeType: string;
  /** 保存对话框的类型过滤器 */
  filterName: string;
  extensions: string[];
}

export interface SaveExportDeps {
  isNativeAvailable?: () => boolean;
  nativeSave?: (args: {
    defaultName: string;
    contentsBase64: string;
    filterName: string;
    extensions: string[];
  }) => Promise<{ canceled: boolean; path?: string | null }>;
  browserDownload?: (blob: Blob, fileName: string) => void;
}

export function isNativeSaveAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isTauri();
  } catch {
    return false;
  }
}

/** UTF-8 文本 → 字节。btoa 不能直接吃中文，必须先编码 */
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** data URL → 字节（用于 PNG 这类已经是 base64 的产物） */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(',');
  const payload = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // 分块，避免超长参数把调用栈打爆
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function defaultNativeSave(args: {
  defaultName: string;
  contentsBase64: string;
  filterName: string;
  extensions: string[];
}) {
  return invoke<{ canceled: boolean; path?: string | null }>('export_save_file', {
    defaultName: args.defaultName,
    contentsBase64: args.contentsBase64,
    filterName: args.filterName,
    extensions: args.extensions
  });
}

/**
 * 保存一份导出产物。
 *
 * 桌面端原生保存失败时**不静默吞掉**，而是退回浏览器下载并照常返回结果——
 * 用户要的是拿到文件，不该因为对话框出问题就一无所获。
 */
export async function saveExportFile(
  request: SaveExportRequest,
  deps: SaveExportDeps = {}
): Promise<SaveExportResult> {
  const nativeAvailable = (deps.isNativeAvailable ?? isNativeSaveAvailable)();
  const nativeSave = deps.nativeSave ?? defaultNativeSave;
  const browserDownload = deps.browserDownload ?? downloadBlob;

  if (nativeAvailable) {
    try {
      const res = await nativeSave({
        defaultName: request.fileName,
        contentsBase64: bytesToBase64(request.bytes),
        filterName: request.filterName,
        extensions: request.extensions
      });

      if (res.canceled) {
        return { status: 'canceled', fileName: request.fileName };
      }
      return {
        status: 'saved',
        path: res.path || undefined,
        fileName: request.fileName
      };
    } catch (err) {
      console.warn('[export] 原生保存失败，退回浏览器下载', err);
    }
  }

  const blob = new Blob([request.bytes as unknown as BlobPart], { type: request.mimeType });
  browserDownload(blob, request.fileName);
  return { status: 'downloaded', fileName: request.fileName };
}
