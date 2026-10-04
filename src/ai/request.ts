/**
 * Export for an AI agent (docs/AI-PARTS-MANUAL.md): everything it needs to look up the parts
 * of a board in their datasheets and fill in the source values: the parts with their KiCad
 * fields (MPN, manufacturer, datasheet) and the nets at their pins, the sources so far, the
 * app's suggestions, and where the manual is. The answer is a normal scenario file with
 * provenance and a list of missing information.
 */
import type { BoardModel } from '../model/types';
import type { Scenario } from '../state/scenario';
import type { Source } from '../physics/sources';

export const AI_REQUEST_KIND = 'pcb-field-ai-request';

export interface AiComponent {
  ref: string;
  value: string;
  footprint: string;
  side: 'top' | 'bottom';
  /** Symbol fields on the footprint: Datasheet, MPN, Manufacturer, Description, … */
  fields: Record<string, string>;
  /** Pad number → net name (pads without a net are left out). */
  pins: Record<string, string>;
  /** Pin function / electrical type from the schematic, where KiCad has them. */
  pinInfo?: Record<string, { function?: string; type?: string }>;
}

export interface AiRequest {
  kind: typeof AI_REQUEST_KIND;
  version: 1;
  manual: string;
  task: string;
  board: { fileName: string; hash: string; layers: string[]; stackupFromFile: boolean; sizeMm: [number, number] };
  components: AiComponent[];
  scenario: Scenario;
  suggestions: { reason: string; source: Source }[];
}

export function buildAiRequest(board: BoardModel, scenario: Scenario, suggestions: { reason: string; source: Source }[], manualUrl: string): AiRequest {
  const components: AiComponent[] = board.footprints.map((f) => {
    const pins: Record<string, string> = {};
    const pinInfo: Record<string, { function?: string; type?: string }> = {};
    for (const pi of f.pads) {
      const p = board.pads[pi]!;
      if (p.net > 0 && p.number) pins[p.number] = board.nets[p.net]!;
      if (p.number && (p.pinFunction || p.pinType)) pinInfo[p.number] = { ...(p.pinFunction ? { function: p.pinFunction } : {}), ...(p.pinType ? { type: p.pinType } : {}) };
    }
    return {
      ref: f.ref,
      value: f.value,
      footprint: f.lib,
      side: f.side,
      fields: f.fields,
      pins,
      ...(Object.keys(pinInfo).length ? { pinInfo } : {}),
    };
  });
  return {
    kind: AI_REQUEST_KIND,
    version: 1,
    manual: manualUrl,
    task:
      'Read the manual. Identify the EMC-relevant parts, look up their datasheets and return a scenario JSON with every source value filled in, ' +
      'a provenance entry per value, and a "missing" list of every part whose data you could not find (with what you assumed instead). ' +
      'Then print a short summary with the table of missing information.',
    board: {
      fileName: board.source.fileName,
      hash: scenario.board.hash,
      layers: board.layers.map((l) => l.name),
      stackupFromFile: board.stackupFromFile,
      sizeMm: [Math.round((board.bbox.x1 - board.bbox.x0) * 10) / 10, Math.round((board.bbox.y1 - board.bbox.y0) * 10) / 10],
    },
    components: components.sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true })),
    scenario,
    suggestions,
  };
}
