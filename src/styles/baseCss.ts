import coreCss from './base.css?raw';
import pcCss from './base.pc.css?raw';
import mobileCss from './base.mobile.css?raw';

export type DeviceProfile = 'pc' | 'mobile';

/**
 * 工程基座样式表的**唯一权威源** (doc/aesthetic/spec.md §0.1 / T-AE-02)。
 *
 * 画布渲染、导出产物、设计系统面板三处此前各自内联了一份硬编码副本，
 * 彼此不一致（72 / 46 / 展示样例），导致画布好看的页面导出后走样。
 * 现全部经此处获取。
 *
 * 设备分档 (T-AE-07)：PC 与移动端的美学口径不同——移动端没有 hover、
 * 不用多列栅格；PC 不需要安全区与底部 TabBar。因此设备专属类在**编译期**
 * 按档位注入，另一档位的类名白名单中不会出现，模型也就不会被告知它们。
 * 工程的 deviceProfile 建工程时选定后不可更改 (PRD D8)，无需运行时切换。
 */
export function getBaseCss(device: DeviceProfile): string {
  return `${coreCss}\n${device === 'pc' ? pcCss : mobileCss}`;
}

/** 两档位的并集，仅供不关心设备的场景（如跨档位校验）使用 */
export const ALL_BASE_CSS: string = `${coreCss}\n${pcCss}\n${mobileCss}`;
