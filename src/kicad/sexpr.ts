/**
 * Minimal S-expression reader for KiCad files.
 *
 * A list is an array whose first element is its head symbol, e.g. `(at 1 2 90)` becomes
 * `['at', '1', '2', '90']`. Atoms stay strings (quoted strings are unquoted); numbers are
 * parsed by the caller, which knows the expected type. Unknown nodes are kept, so the reader
 * is tolerant to new KiCad versions.
 */
export type SAtom = string;
export type SList = [string, ...SExpr[]];
export type SExpr = SAtom | SList;

export class SExprError extends Error {}

const OPEN = 40; // (
const CLOSE = 41; // )
const QUOTE = 34; // "
const BACKSLASH = 92;

function isSpace(c: number): boolean {
  return c === 32 || c === 9 || c === 10 || c === 13;
}

export function parseSExpr(text: string): SList {
  const stack: SExpr[][] = [];
  let current: SExpr[] | null = null;
  let root: SList | null = null;
  let i = 0;
  const n = text.length;

  const pushAtom = (atom: string) => {
    if (!current) throw new SExprError(`atom outside of a list at offset ${i}`);
    current.push(atom);
  };

  while (i < n) {
    const c = text.charCodeAt(i);
    if (isSpace(c)) {
      i++;
    } else if (c === OPEN) {
      const list: SExpr[] = [];
      if (current) {
        current.push(list as SList);
        stack.push(current);
      }
      current = list;
      i++;
    } else if (c === CLOSE) {
      if (!current) throw new SExprError(`unbalanced ")" at offset ${i}`);
      if (current.length === 0 || typeof current[0] !== 'string') {
        // KiCad never writes empty or headless lists; keep them as an empty-head list.
        current.unshift('');
      }
      const done = current as SList;
      const parent = stack.pop();
      if (parent) {
        current = parent;
      } else {
        root = done;
        current = null;
      }
      i++;
    } else if (c === QUOTE) {
      let j = i + 1;
      let out = '';
      let start = j;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === BACKSLASH) {
          out += text.slice(start, j);
          const e = text[j + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : (e ?? '');
          j += 2;
          start = j;
        } else if (d === QUOTE) {
          break;
        } else {
          j++;
        }
      }
      if (j >= n) throw new SExprError(`unterminated string at offset ${i}`);
      out += text.slice(start, j);
      pushAtom(out);
      i = j + 1;
    } else {
      let j = i;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (isSpace(d) || d === OPEN || d === CLOSE) break;
        j++;
      }
      pushAtom(text.slice(i, j));
      i = j;
    }
  }
  if (current) throw new SExprError('unexpected end of input (missing ")")');
  if (!root) throw new SExprError('empty input');
  return root;
}

export function isList(e: SExpr | undefined): e is SList {
  return Array.isArray(e);
}

/** First child list with the given head. */
export function child(node: SList, head: string): SList | undefined {
  for (let k = 1; k < node.length; k++) {
    const e = node[k];
    if (Array.isArray(e) && e[0] === head) return e;
  }
  return undefined;
}

/** All child lists with the given head. */
export function children(node: SList, head: string): SList[] {
  const out: SList[] = [];
  for (let k = 1; k < node.length; k++) {
    const e = node[k];
    if (Array.isArray(e) && e[0] === head) out.push(e);
  }
  return out;
}

/** Atom at position idx (1 = first argument) as number, or fallback. */
export function num(node: SList | undefined, idx = 1, fallback = NaN): number {
  if (!node) return fallback;
  const e = node[idx];
  if (typeof e !== 'string') return fallback;
  const v = Number(e);
  return Number.isFinite(v) ? v : fallback;
}

/** Atom at position idx as string, or fallback. */
export function str(node: SList | undefined, idx = 1, fallback = ''): string {
  if (!node) return fallback;
  const e = node[idx];
  return typeof e === 'string' ? e : fallback;
}

/** All atom arguments of a node (skips nested lists). */
export function atoms(node: SList): string[] {
  const out: string[] = [];
  for (let k = 1; k < node.length; k++) {
    const e = node[k];
    if (typeof e === 'string') out.push(e);
  }
  return out;
}
