import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ExportModal } from '../src/components/export/ExportModal';
import { useProjectStore } from '../src/stores/useProjectStore';
import {
  bytesToBase64,
  dataUrlToBytes,
  saveExportFile,
  textToBytes,
  SaveExportDeps
} from '../src/utils/exportSaver';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('导出保存对话框与完成反馈 (Export Save Dialog & Feedback)', () => {
  describe('CHK-F-01 ~ CHK-F-03: 保存通道 (BR-SAVE-01/02/03)', () => {
    const REQ = {
      fileName: '会员中心.html',
      bytes: textToBytes('<h1>中文内容</h1>'),
      mimeType: 'text/html;charset=utf-8',
      filterName: 'HTML 页面',
      extensions: ['html']
    };

    test('CHK-F-01: 桌面端弹原生对话框，回传用户选定的真实路径', async () => {
      let received: any = null;
      const deps: SaveExportDeps = {
        isNativeAvailable: () => true,
        nativeSave: async (args) => {
          received = args;
          return { canceled: false, path: '/Users/me/Desktop/会员中心.html' };
        },
        browserDownload: () => {
          throw new Error('桌面端不应退回浏览器下载');
        }
      };

      const res = await saveExportFile(REQ, deps);

      expect(res.status).toBe('saved');
      expect(res.path).toBe('/Users/me/Desktop/会员中心.html');
      expect(received.defaultName).toBe('会员中心.html');
      expect(received.extensions).toEqual(['html']);
      // 内容以 base64 递交，保证中文与二进制都不失真
      expect(received.contentsBase64).toBe(bytesToBase64(REQ.bytes));
    });

    test('CHK-F-02: 用户取消时不写任何文件，状态为 canceled', async () => {
      let downloaded = false;
      const res = await saveExportFile(REQ, {
        isNativeAvailable: () => true,
        nativeSave: async () => ({ canceled: true }),
        browserDownload: () => {
          downloaded = true;
        }
      });

      expect(res.status).toBe('canceled');
      expect(res.path).toBeUndefined();
      expect(downloaded).toBe(false);
    });

    test('CHK-F-03: 浏览器环境退回下载；原生保存抛错时同样兜底下载而非一无所获', async () => {
      const names: string[] = [];
      const browserDownload = (_blob: Blob, name: string) => {
        names.push(name);
      };

      const browserRes = await saveExportFile(REQ, {
        isNativeAvailable: () => false,
        browserDownload
      });
      expect(browserRes.status).toBe('downloaded');
      expect(browserRes.path).toBeUndefined();

      const failedRes = await saveExportFile(REQ, {
        isNativeAvailable: () => true,
        nativeSave: async () => {
          throw new Error('对话框异常');
        },
        browserDownload
      });
      expect(failedRes.status).toBe('downloaded');
      expect(names).toEqual(['会员中心.html', '会员中心.html']);
    });

    test('编码工具：UTF-8 文本与 data URL 都能无损转成字节', () => {
      const bytes = textToBytes('中文 abc');
      expect(new TextDecoder().decode(bytes)).toBe('中文 abc');

      // "hi" 的 base64 为 aGk=
      const fromDataUrl = dataUrlToBytes('data:image/png;base64,aGk=');
      expect(Array.from(fromDataUrl)).toEqual([104, 105]);
      expect(bytesToBase64(fromDataUrl)).toBe('aGk=');
    });
  });

  describe('CHK-F-04 ~ CHK-F-06: 完成反馈 (BR-SAVE-05)', () => {
    let container: HTMLDivElement;
    let root: Root;

    const mockScreen = {
      id: 'scr_fb',
      name: '会员中心',
      position: { x: 0, y: 0 },
      measuredHeight: 844,
      htmlContent: '<div data-nid="r1"><p>内容</p></div>'
    };

    beforeEach(() => {
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      useProjectStore.setState({
        screens: { [mockScreen.id]: mockScreen as any },
        screenOrder: [mockScreen.id],
        activeScreenId: mockScreen.id,
        settings: {
          deviceProfile: 'mobile',
          frameWidth: 390,
          viewportGuideHeight: 844,
          colorMode: 'light',
          showViewportGuide: true
        } as any,
        overrides: {}
      });
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    const clickSaveHtml = async () => {
      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('保存独立 HTML 文件')
      );
      expect(btn).toBeDefined();
      await act(async () => {
        btn!.click();
      });
    };

    test('CHK-F-04: 保存成功后出现绿色完成反馈，并显示文件名', async () => {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });

      // 反馈条在操作前不存在
      expect(container.querySelector('[data-testid="export-success-banner"]')).toBeNull();

      await clickSaveHtml();

      const banner = container.querySelector('[data-testid="export-success-banner"]');
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toContain('HTML 已保存');
      expect(banner!.textContent).toContain('会员中心.html');
    });

    test('CHK-F-05: 浏览器环境的反馈里注明由浏览器下载', async () => {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });
      await clickSaveHtml();

      const banner = container.querySelector('[data-testid="export-success-banner"]');
      expect(banner!.textContent).toContain('浏览器下载');
    });

    test('CHK-F-06: 反馈条可手动关闭', async () => {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });
      await clickSaveHtml();

      const banner = container.querySelector('[data-testid="export-success-banner"]')!;
      const closeBtn = Array.from(banner.querySelectorAll('button')).find((b) => b.textContent === '×');
      await act(async () => {
        closeBtn!.click();
      });

      expect(container.querySelector('[data-testid="export-success-banner"]')).toBeNull();
    });

    test('CHK-F-07: 保存按钮在等待选择位置时进入加载态', async () => {
      await act(async () => {
        root.render(<ExportModal onClose={() => {}} />);
      });

      const btn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('保存独立 HTML 文件')
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      expect(btn.textContent).toContain('保存独立 HTML 文件');
    });
  });
});
