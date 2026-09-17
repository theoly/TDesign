import { describe, test, expect } from 'bun:test';
import { inspectText, setDirectText, setTextByNid, uneditableHint } from '../src/utils/textNode';

const parse = (html: string): Element =>
  new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body.firstElementChild!;

describe('inspectText —— 取值与可编辑性判定 (ISSUE-002/003)', () => {
  test('纯文本元素：取到文本且可编辑', () => {
    const info = inspectText(parse('<p>你好</p>'));
    expect(info.text).toBe('你好');
    expect(info.editable).toBe(true);
  });

  test('含嵌套子元素：只取直接子文本，且不可编辑', () => {
    // 此前用 innerText 会得到 "标题正文"，编辑后会摧毁两个子元素
    const info = inspectText(parse('<div><span>标题</span>正文</div>'));
    expect(info.text).toBe('正文');
    expect(info.editable).toBe(false);
    expect(info.reason).toBe('has-children');
  });

  test('格式化 HTML（带缩进换行）：忽略纯空白节点，不返回空值', () => {
    const info = inspectText(parse('<p>\n      按钮文案\n    </p>'));
    expect(info.text).toBe('按钮文案');
    expect(info.editable).toBe(true);
  });

  test('空元素（void element）：不可编辑', () => {
    const info = inspectText(parse('<img src="x.png">'));
    expect(info.text).toBe('');
    expect(info.editable).toBe(false);
    expect(info.reason).toBe('void-element');
  });

  test('多段直接文本：不可编辑', () => {
    const el = parse('<p>A</p>');
    el.appendChild(el.ownerDocument.createTextNode('B'));
    // <p>A</p> 追加后为两个直接文本节点
    const info = inspectText(el);
    expect(info.editable).toBe(false);
    expect(info.reason).toBe('multiple-text-nodes');
  });

  test('无文本的纯容器：可编辑（允许补写文案），文本为空', () => {
    const info = inspectText(parse('<div></div>'));
    expect(info.text).toBe('');
    expect(info.editable).toBe(true);
  });

  test('每种不可编辑原因都有面向用户的提示文案', () => {
    for (const r of ['void-element', 'has-children', 'multiple-text-nodes'] as const) {
      expect(uneditableHint(r).length).toBeGreaterThan(0);
    }
  });
});

describe('setDirectText —— 写回不触碰子元素 (ISSUE-003)', () => {
  test('纯文本元素：正确替换', () => {
    const el = parse('<p>旧</p>');
    expect(setDirectText(el, '新')).toBe(true);
    expect(el.outerHTML).toBe('<p>新</p>');
  });

  test('含子元素：拒绝写入，结构完好', () => {
    const el = parse('<div><span>A</span>B</div>');
    expect(setDirectText(el, '毁灭')).toBe(false);
    expect(el.querySelector('span')).not.toBeNull();
    expect(el.outerHTML).toBe('<div><span>A</span>B</div>');
  });

  test('空元素容器：补写文案', () => {
    const el = parse('<div></div>');
    expect(setDirectText(el, '新增')).toBe(true);
    expect(el.textContent).toBe('新增');
  });

  test('值未变化时返回 false，避免产生空的历史条目', () => {
    expect(setDirectText(parse('<p>同样</p>'), '同样')).toBe(false);
  });
});

describe('setTextByNid —— HTML 字符串写回 (ISSUE-004)', () => {
  test('V1 纯文本元素：写回且 HTML 合法', () => {
    const out = setTextByNid('<p data-nid="a1">旧文案</p>', 'a1', '新文案');
    expect(out).toBe('<p data-nid="a1">新文案</p>');
  });

  test('V2 嵌套元素：不产生非法 HTML', () => {
    // 旧正则 (<开标签>)(.*?)(<\/任意闭合标签>) 会在第一个 </span> 处截断，
    // 产出 <div data-nid="x">新</span>B</div> 这种标签错配结构
    const html = '<div data-nid="x"><span>A</span>B</div>';
    const out = setTextByNid(html, 'x', '新');
    expect(out).toBeNull();

    // 即便强行解析原 HTML，结构也必须保持完整
    const el = parse(html);
    expect(el.querySelector('span')?.textContent).toBe('A');
  });

  test('V3 空元素：返回 null 而非静默产生假成功', () => {
    expect(setTextByNid('<img data-nid="i1" src="a.png">', 'i1', '文字')).toBeNull();
  });

  test('V4 写回后的 HTML 可被重新解析，结构合法', () => {
    const out = setTextByNid(
      '<section data-nid="s1"><h1 data-nid="h1">标题</h1><p data-nid="p1">正文</p></section>',
      'p1',
      '改过的正文'
    )!;
    expect(out).not.toBeNull();
    const reparsed = new DOMParser().parseFromString(`<body>${out}</body>`, 'text/html');
    expect(reparsed.querySelector('[data-nid="h1"]')?.textContent).toBe('标题');
    expect(reparsed.querySelector('[data-nid="p1"]')?.textContent).toBe('改过的正文');
    expect(reparsed.querySelectorAll('[data-nid]').length).toBe(3);
  });

  test('nid 不存在：返回 null', () => {
    expect(setTextByNid('<p data-nid="a1">x</p>', 'nope', 'y')).toBeNull();
  });

  test('保留兄弟节点与属性，只改目标文本', () => {
    const out = setTextByNid(
      '<div data-nid="d"><button data-nid="b" class="btn btn-primary">提交</button></div>',
      'b',
      '立即体验'
    )!;
    expect(out).toContain('class="btn btn-primary"');
    expect(out).toContain('立即体验');
    expect(out).not.toContain('提交');
  });
});
