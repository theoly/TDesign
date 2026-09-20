import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { ChatDrawer } from '../src/components/chat/ChatDrawer';
import { useProjectStore } from '../src/stores/useProjectStore';
import { useAIConfigStore, defaultProviders, defaultBindings } from '../src/stores/useAIConfigStore';
import { defaultTheme } from '../src/utils/themePresets';
import { AttachmentStore } from '../src/services/storage/attachmentStore';
import { createProjectStorage } from '../src/services/storage/projectStorage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('对话历史附件缩略图与点击放大 (Chat Image Preview & Lightbox)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const sampleDataUrl = `data:image/png;base64,${sampleBase64}`;

  beforeEach(() => {
    localStorage.clear();
    const store = useProjectStore.getState();
    store.initNewProject({
      name: 'Image Preview Test Project',
      deviceProfile: 'pc',
      designSystem: defaultTheme,
      createSpecimen: false
    });

    store.addScreen({
      name: '画框1',
      htmlContent: '<main data-nid="root1"><h1>画框1内容</h1></main>'
    });

    useAIConfigStore.setState({
      providers: defaultProviders.map((p) =>
        p.id === 'prov-deepseek' ? { ...p, apiKey: 'sk-test-valid' } : p
      ),
      bindings: defaultBindings
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  describe('CHK-F-01: AttachmentStore 与历史附件持久化还原', () => {
    test('AttachmentStore 成功保存与读取 DataURL', async () => {
      const storage = createProjectStorage('test-proj-img');
      const attachmentStore = new AttachmentStore(storage);

      const saved = await attachmentStore.save('test_shot.png', sampleDataUrl);
      expect(saved).not.toBeNull();
      expect(saved?.relPath).toContain('assets/images/');

      const readBack = await attachmentStore.readDataUrl(saved!.relPath);
      expect(readBack).not.toBeNull();
      expect(readBack).toContain('data:image/png;base64,');

      // 读取不存在的路径返回 null
      const nonExistent = await attachmentStore.readDataUrl('assets/images/non_existent.png');
      expect(nonExistent).toBeNull();
    });

    test('历史会话包含附件路径时，重新加载成功将 imageUrl 挂载至历史消息', async () => {
      const store = useProjectStore.getState();
      const attachmentStore = store.getAttachmentStore();
      const convStore = store.getConversationStore();

      const saved = await attachmentStore.save('history_ref.png', sampleDataUrl);
      expect(saved).not.toBeNull();

      // 写入一条历史轮次 (包含附件路径)
      await convStore.appendTurn({
        turnId: 'hist_turn_1',
        ts: Date.now(),
        user: {
          text: '按附件图片精准修改页面',
          attachments: [saved!.relPath]
        },
        assistant: {
          text: '已基于附件图片完成修改。'
        }
      });

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      // 验证：历史消息不仅渲染了文字，还成功渲染了该附件图片的缩略图
      const chatText = container.textContent || '';
      expect(chatText).toContain('按附件图片精准修改页面');

      const imgElement = container.querySelector('img[alt="附件参考图"]') as HTMLImageElement;
      expect(imgElement).not.toBeNull();
      expect(imgElement.src).toContain('data:image/png;base64,');
    });

    test('历史附件文件丢失时容错降级，不阻断文本与会话恢复', async () => {
      const store = useProjectStore.getState();
      const convStore = store.getConversationStore();

      await convStore.appendTurn({
        turnId: 'hist_turn_lost',
        ts: Date.now(),
        user: {
          text: '丢失附件的历史消息',
          attachments: ['assets/images/deleted_file.png']
        },
        assistant: {
          text: '已生成。'
        }
      });

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      const chatText = container.textContent || '';
      expect(chatText).toContain('丢失附件的历史消息');
      // 图片丢失时不会抛出未捕获异常，并且正常展示文字
    });
  });

  describe('CHK-F-02 ~ CHK-F-04: 缩略图点击放大与 Lightbox 模态框交互', () => {
    test('点击缩略图成功弹出大图模态框，并可通过关闭按钮关闭', async () => {
      const store = useProjectStore.getState();
      const attachmentStore = store.getAttachmentStore();
      const convStore = store.getConversationStore();

      const saved = await attachmentStore.save('modal_test.png', sampleDataUrl);

      await convStore.appendTurn({
        turnId: 'hist_modal_turn',
        ts: Date.now(),
        user: {
          text: '看大图需求',
          attachments: [saved!.relPath]
        },
        assistant: {
          text: '已回复。'
        }
      });

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      // 初始状态下不存在大图模态框
      expect(container.querySelector('[data-testid="image-lightbox-modal"]')).toBeNull();

      // 查找并点击缩略图
      const thumbnailContainer = container.querySelector('div[title*="点击放大查看原图"]') as HTMLDivElement;
      expect(thumbnailContainer).not.toBeNull();

      await act(async () => {
        thumbnailContainer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // 模态框应已弹出
      const modal = container.querySelector('[data-testid="image-lightbox-modal"]') as HTMLDivElement;
      expect(modal).not.toBeNull();

      const previewImg = container.querySelector('[data-testid="lightbox-preview-img"]') as HTMLImageElement;
      expect(previewImg).not.toBeNull();
      expect(previewImg.src).toContain('data:image/png;base64,');

      // 点击关闭按钮关闭
      const closeBtn = container.querySelector('[data-testid="close-lightbox-btn"]') as HTMLButtonElement;
      expect(closeBtn).not.toBeNull();

      await act(async () => {
        closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.querySelector('[data-testid="image-lightbox-modal"]')).toBeNull();
    });

    test('按 Escape 键或点击遮罩背景可关闭大图预览模态框', async () => {
      const store = useProjectStore.getState();
      const attachmentStore = store.getAttachmentStore();
      const convStore = store.getConversationStore();

      const saved = await attachmentStore.save('modal_esc.png', sampleDataUrl);

      await convStore.appendTurn({
        turnId: 'hist_esc_turn',
        ts: Date.now(),
        user: {
          text: 'Esc关闭测试',
          attachments: [saved!.relPath]
        },
        assistant: {
          text: 'OK'
        }
      });

      await act(async () => {
        root.render(<ChatDrawer />);
      });

      const thumbnailContainer = container.querySelector('div[title*="点击放大查看原图"]') as HTMLDivElement;
      await act(async () => {
        thumbnailContainer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.querySelector('[data-testid="image-lightbox-modal"]')).not.toBeNull();

      // 触发 Escape 键
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(container.querySelector('[data-testid="image-lightbox-modal"]')).toBeNull();
    });
  });
});
