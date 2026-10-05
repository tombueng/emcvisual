import { describe, expect, it } from 'vitest';
import { de } from '../src/i18n/de';
import { en } from '../src/i18n/en';
import { BOARD_KINDS, type DiagnosticKind } from '../src/physics/diagnostics';

const ALL: DiagnosticKind[] = ['return-gap', 'ref-change', 'no-stitching', 'long-line', 'hot-loop', 'no-reference', 'edge-trace', 'cable-cm', 'io-coupling', 'no-adjacent-plane', 'pair-skew', 'connector-ground', ...BOARD_KINDS];

describe('every finding has its texts in both languages', () => {
  for (const [lang, t] of [['de', de], ['en', en]] as const) {
    it(`${lang}: short text, bubble title`, () => {
      for (const k of ALL) {
        expect(typeof (t.diag.kinds as Record<string, unknown>)[k], `${lang} diag.kinds.${k}`).toBe('function');
        expect(typeof (t.callouts.kinds as Record<string, unknown>)[k], `${lang} callouts.kinds.${k}`).toBe('string');
      }
    });
  }
});
