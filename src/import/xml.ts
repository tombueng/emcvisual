/**
 * A small XML reader for the board formats (Eagle, IPC-2581). It runs the same in the browser
 * and in Node (the command-line check and the tests have no DOMParser), reads elements,
 * attributes and text, and skips comments, processing instructions, doctype and CDATA markup.
 * Namespace prefixes are dropped from element names ("ipc:Layer" → "Layer").
 */
export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

export class XmlError extends Error {}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const localName = (n: string) => {
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
};

/** Parse a document; returns the root element. */
export function parseXml(src: string): XNode {
  const root: XNode = { name: '#document', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const tag = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
  const attr = /([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let i = 0;
  const n = src.length;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) {
      const top = stack[stack.length - 1]!;
      const t = src.slice(i, lt);
      if (t.trim()) top.text += decodeEntities(t);
    }
    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      stack[stack.length - 1]!.text += src.slice(lt + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      // doctype (may contain an internal subset in brackets)
      let depth = 0;
      let k = lt + 2;
      for (; k < n; k++) {
        const c = src[k];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
      }
      i = k + 1;
      continue;
    }
    tag.lastIndex = lt;
    const m = tag.exec(src);
    if (!m) throw new XmlError(`malformed tag at offset ${lt}`);
    i = tag.lastIndex;
    const name = localName(m[2]!);
    if (m[1]) {
      // closing tag: pop to the matching element (tolerates unclosed children)
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k]!.name === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    if (m[3]) {
      attr.lastIndex = 0;
      let a: RegExpExecArray | null;
      while ((a = attr.exec(m[3]))) attrs[localName(a[1]!)] = decodeEntities(a[2] ?? a[3] ?? '');
    }
    const node: XNode = { name, attrs, children: [], text: '' };
    stack[stack.length - 1]!.children.push(node);
    if (!m[4]) stack.push(node);
  }
  const first = root.children[0];
  if (!first) throw new XmlError('no root element');
  return first;
}

/** First child element with the name. */
export const xchild = (n: XNode | undefined, name: string): XNode | undefined => n?.children.find((c) => c.name === name);

/** All child elements with the name. */
export const xchildren = (n: XNode | undefined, name: string): XNode[] => (n ? n.children.filter((c) => c.name === name) : []);

/** All descendants with the name (depth first, document order). */
export function xfind(n: XNode | undefined, name: string, out: XNode[] = []): XNode[] {
  if (!n) return out;
  for (const c of n.children) {
    if (c.name === name) out.push(c);
    xfind(c, name, out);
  }
  return out;
}

/** Numeric attribute (NaN-safe with a default). */
export function xnum(n: XNode | undefined, key: string, def = 0): number {
  const v = n?.attrs[key];
  if (v === undefined || v === '') return def;
  const x = Number(v);
  return Number.isFinite(x) ? x : def;
}
