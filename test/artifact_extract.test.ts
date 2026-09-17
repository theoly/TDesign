import { describe, test, expect } from 'bun:test';
import {
  extractArtifact,
  extractHtmlFromResponse
} from '../src/services/ai/engine/pipeline/interceptors/streamTransform';

describe('CHK-OD-03 · 结构化 Artifact 提取契约', () => {
  test('解析完整的 <artifact> 标签并提取属性', () => {
    const raw = `Here is your UI:
<artifact identifier="screen_login" type="screen" title="用户登录页">
<div class="card p-6">
  <h1 class="text-xl font-bold">Login</h1>
</div>
</artifact>
Hope you like it!`;

    const result = extractArtifact(raw);
    expect(result).toBeDefined();
    expect(result?.identifier).toBe('screen_login');
    expect(result?.type).toBe('screen');
    expect(result?.title).toBe('用户登录页');
    expect(result?.html).toBe('<div class="card p-6">\n  <h1 class="text-xl font-bold">Login</h1>\n</div>');
    expect(result?.isFallback).toBe(false);
    expect(result?.isComplete).toBe(true);
    expect(result?.warnings).toBeUndefined();
  });

  test('流式中途未闭合的 <artifact> 块能够容错截取并标为 isComplete=false', () => {
    const streamingRaw = `Thinking...
<artifact identifier="screen_dash" type="dashboard" title="实时监控大屏">
<div class="card p-6">
  <h2>Streaming in progress...`;

    const result = extractArtifact(streamingRaw);
    expect(result).toBeDefined();
    expect(result?.identifier).toBe('screen_dash');
    expect(result?.type).toBe('dashboard');
    expect(result?.title).toBe('实时监控大屏');
    expect(result?.html).toBe('<div class="card p-6">\n  <h2>Streaming in progress...');
    expect(result?.isFallback).toBe(false);
    expect(result?.isComplete).toBe(false);
  });
});

describe('CHK-OD-15 · BR-01.5 多个 <artifact> 块保护', () => {
  test('响应含 ≥2 个顶层 <artifact> 块时，取第一个完整块并附加 multiple_artifacts 告警，严禁静默拼接', () => {
    const raw = `
<artifact identifier="art_1" type="screen" title="第一页">
<div class="page-1">Page 1</div>
</artifact>

<artifact identifier="art_2" type="screen" title="第二页">
<div class="page-2">Page 2</div>
</artifact>
`;

    const result = extractArtifact(raw);
    expect(result).toBeDefined();
    expect(result?.identifier).toBe('art_1');
    expect(result?.title).toBe('第一页');
    expect(result?.html).toBe('<div class="page-1">Page 1</div>');
    expect(result?.warnings).toContain('multiple_artifacts');
  });
});

describe('CHK-OD-04 · 三重平滑降级兼容契约 (NFR-R01)', () => {
  test('降级一级：能够无损提取经典 Markdown html 代码块', () => {
    const raw = `
\`\`\`html
<div class="card">
  <span>Markdown Fallback</span>
</div>
\`\`\`
`;
    const artifact = extractArtifact(raw);
    expect(artifact?.isFallback).toBe(true);
    expect(artifact?.isComplete).toBe(true);
    expect(artifact?.html).toBe('<div class="card">\n  <span>Markdown Fallback</span>\n</div>');

    // extractHtmlFromResponse 保持 100% 兼容
    const html = extractHtmlFromResponse(raw);
    expect(html).toBe('<div class="card">\n  <span>Markdown Fallback</span>\n</div>');
  });

  test('降级二级：通用代码块包含有效 HTML 标签', () => {
    const raw = `
\`\`\`
<main class="container">
  <p>Generic Block</p>
</main>
\`\`\`
`;
    const artifact = extractArtifact(raw);
    expect(artifact?.isFallback).toBe(true);
    expect(artifact?.html).toBe('<main class="container">\n  <p>Generic Block</p>\n</main>');
  });

  test('降级三级：原生 HTML 标签探测', () => {
    const raw = `Sure! Here is the code:
<section class="hero p-8">
  <h1>Raw HTML</h1>
</section>`;

    const artifact = extractArtifact(raw);
    expect(artifact?.isFallback).toBe(true);
    expect(artifact?.html).toBe('<section class="hero p-8">\n  <h1>Raw HTML</h1>\n</section>');
  });

  test('无任何有效 HTML 时返回 undefined 而非异常', () => {
    const raw = `Hello! How can I help you today? No code here.`;
    expect(extractArtifact(raw)).toBeUndefined();
    expect(extractHtmlFromResponse(raw)).toBeUndefined();
  });
});

describe('CHK-N-05 · 性能基准断言 (NFR-P01)', () => {
  test('extractArtifact 单次调用开销 ≤ 2ms（典型 50KB 响应，取 100 次均值）', () => {
    // 构造约 50KB 响应体
    const padding = '<!-- padding content -->\n'.repeat(2000);
    const payload = `Here is your UI:\n<artifact identifier="bench" type="screen" title="Benchmark Screen">\n<div class="container">\n${padding}</div>\n</artifact>\nDone.`;
    expect(payload.length).toBeGreaterThan(45000);

    // 预热 5 次
    for (let i = 0; i < 5; i++) {
      extractArtifact(payload);
    }

    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const res = extractArtifact(payload);
      expect(res).toBeDefined();
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / iterations;

    // 断言均值 <= 2ms
    expect(avgMs).toBeLessThan(2.0);
  });
});

