/**
 * 工程文件夹选择 (A2 / T-AE-43, PRD §3.0.1)。
 *
 * 规范接入 Tauri 2 官方 @tauri-apps/plugin-dialog 与运行时判定。
 * 非 Tauri 环境（纯浏览器开发 / 测试）返回 null，调用方据此回退 localStorage。
 */

import { isTauri } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

/**
 * 判定当前是否处于 Tauri 桌面端运行环境。
 * 覆盖 Tauri 2 官方 isTauri()、原生 window.isTauri、__TAURI_INTERNALS__ 与全局 __TAURI__ 对象。
 */
export function isDesktopRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (isTauri()) return true;
  } catch {
    // 环境缺少 window.__TAURI_INTERNALS__ 时抛错，安全捕获
  }

  const w = window as unknown as {
    isTauri?: boolean;
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: { core?: { invoke?: unknown } };
  };

  return Boolean(w.isTauri || w.__TAURI_INTERNALS__ || w.__TAURI__?.core?.invoke);
}

/** 弹出文件夹选择器。用户取消或非桌面环境返回 null */
export async function pickProjectFolder(title = '选择工程文件夹'): Promise<string | null> {
  if (!isDesktopRuntime()) return null;

  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title
    });
    if (!selected) return null;
    return Array.isArray(selected) ? selected[0] ?? null : selected;
  } catch (e) {
    console.warn('[folderPicker] 选择失败', e);
    return null;
  }
}

/** 从绝对路径取末段作为工程名 */
export function folderDisplayName(path: string): string {
  const seg = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;
  return seg.replace(/\.aidesign$/i, '');
}
