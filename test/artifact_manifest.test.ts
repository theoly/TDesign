import { describe, it, expect, beforeEach } from 'bun:test';
import { ProjectRepository, normalizeToArtifactManifest } from '../src/services/storage/projectRepository';
import { LocalStorageStorage } from '../src/services/storage/projectStorage';
import { ArtifactManifest } from '../src/types/project';

describe('ArtifactManifest Specification (REQ-OD-05 / BR-05)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('CHK-OD-09: normalizes legacy screen data with complete ArtifactManifest fields', () => {
    const legacyScreen = {
      id: 'screen_legacy_01',
      name: '历史订单明细页',
      position: { x: 100, y: 200 },
      measuredHeight: 844
    };

    const manifest: ArtifactManifest = normalizeToArtifactManifest(legacyScreen, 'mobile');

    expect(manifest.id).toBe('screen_legacy_01');
    expect(manifest.kind).toBe('screen');
    expect(manifest.renderer).toBe('html-iframe');
    expect(manifest.entry).toBe('screens/screen_legacy_01.html');
    expect(manifest.title).toBe('历史订单明细页');
    expect(manifest.device).toBe('mobile');
    expect(typeof manifest.createdAt).toBe('string');
    expect(typeof manifest.updatedAt).toBe('string');
  });

  it('CHK-OD-09: load() automatically polyfills renderer and entry for historical project.json', async () => {
    const storage = new LocalStorageStorage('test_proj_legacy');
    const repo = new ProjectRepository(storage);

    // 构造旧版历史 project.json，不包含 renderer 和 entry
    const legacyProjectDoc = {
      id: 'proj_legacy_01',
      name: 'Legacy Project',
      schemaVersion: 1,
      createdAt: 1700000000000,
      settings: {
        deviceProfile: 'pc' as const,
        frameWidth: 1440
      },
      designSystem: {
        id: 'theme-tech-blue'
      },
      screens: {
        scr_001: {
          id: 'scr_001',
          name: 'PC 首页',
          position: { x: 0, y: 0 }
        }
      }
    };

    await storage.writeTextAtomic('project.json', JSON.stringify(legacyProjectDoc));
    await storage.writeTextAtomic('screens/scr_001.html', '<div data-nid="root">Legacy Screen HTML</div>');

    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    const loadedScreen = loaded!.screens['scr_001'];
    expect(loadedScreen).toBeDefined();
    // 自动补齐契约字段
    expect(loadedScreen.renderer).toBe('html-iframe');
    expect(loadedScreen.entry).toBe('screens/scr_001.html');
    expect(loadedScreen.kind).toBe('screen');
    expect(loadedScreen.device).toBe('pc');
    expect(loadedScreen.htmlContent).toBe('<div data-nid="root">Legacy Screen HTML</div>');
  });

  it('CHK-OD-20: save() writes sidecar screens/{id}.manifest.json alongside screen HTML', async () => {
    const storage = new LocalStorageStorage('test_proj_sidecar');
    const repo = new ProjectRepository(storage);

    const projectDoc = {
      id: 'proj_new_01',
      name: 'New Project',
      settings: {
        deviceProfile: 'mobile' as const,
        frameWidth: 390
      },
      designSystem: {
        id: 'theme-vibrant-violet'
      },
      screens: {
        scr_checkout: {
          id: 'scr_checkout',
          name: '收银台页面',
          position: { x: 50, y: 100 },
          measuredHeight: 844,
          htmlContent: '<div data-nid="root" class="bg-base min-h-screen">Checkout</div>',
          scopedCss: '.bg-base { background: var(--color-bg-base); }'
        }
      }
    };

    await repo.save(projectDoc as any);

    // 验证画框 HTML 已写入
    expect(await storage.exists('screens/scr_checkout.html')).toBe(true);
    // 验证侧车 screens/{id}.manifest.json 已写入 (CHK-OD-20)
    expect(await storage.exists('screens/scr_checkout.manifest.json')).toBe(true);

    const rawManifest = await storage.readText('screens/scr_checkout.manifest.json');
    expect(rawManifest).not.toBeNull();
    const manifest = JSON.parse(rawManifest!) as ArtifactManifest;

    expect(manifest.id).toBe('scr_checkout');
    expect(manifest.kind).toBe('screen');
    expect(manifest.renderer).toBe('html-iframe');
    expect(manifest.entry).toBe('screens/scr_checkout.html');
    expect(manifest.title).toBe('收银台页面');
    expect(manifest.device).toBe('mobile');
    expect(manifest.metadata).toBeDefined();
  });
});
