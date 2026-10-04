/**
 * Copper connectivity of one or more nets as a graph: nodes on copper layers, edges for
 * tracks, pad copper, vias and through-hole barrels, and optional bridges over two-pin
 * parts between the nets (a series resistor in a clock line). Zones connect every node
 * inside them; path searches cross a zone in a straight line.
 */
import { distPointSegment, pointInRings, rotateKicad } from './geometry';
import type { BoardModel, Pad } from './types';

export type EdgeKind = 'track' | 'pad' | 'via' | 'thru' | 'bridge' | 'zone';

export interface GNode {
  id: number;
  layer: number;
  x: number;
  y: number;
  pad?: number;
  via?: number;
}

export interface GEdge {
  a: number;
  b: number;
  kind: EdgeKind;
  length: number;
  /** Conductor width (mm); for vertical edges the barrel diameter. */
  width: number;
  /** Copper layer for horizontal edges. */
  layer: number;
  net: number;
}

export interface ZoneMembers {
  zone: number;
  layer: number;
  net: number;
  members: number[];
}

export interface NetGraph {
  nets: number[];
  nodes: GNode[];
  edges: GEdge[];
  adj: number[][];
  /** pad index -> node ids (one per copper layer of the pad, top first) */
  padNodes: Map<number, number[]>;
  zones: ZoneMembers[];
  /** node id -> indices into zones */
  nodeZones: Map<number, number[]>;
}

const KEY_RES = 1000; // 1 µm

export function buildNetGraph(board: BoardModel, nets: number[], bridge = true): NetGraph {
  const netSet = new Set(nets);
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const byKey = new Map<string, number>();
  const layerY = (l: number) => board.layers[l]?.y ?? 0;

  const node = (layer: number, x: number, y: number, extra?: Partial<GNode>): number => {
    const k = `${layer}:${Math.round(x * KEY_RES)}:${Math.round(y * KEY_RES)}`;
    let id = byKey.get(k);
    if (id === undefined) {
      id = nodes.length;
      nodes.push({ id, layer, x, y, ...extra });
      byKey.set(k, id);
    } else if (extra) {
      Object.assign(nodes[id]!, extra);
    }
    return id;
  };
  const edge = (a: number, b: number, kind: EdgeKind, width: number, layer: number, net: number) => {
    if (a === b) return;
    const na = nodes[a]!;
    const nb = nodes[b]!;
    const length =
      kind === 'via' || kind === 'thru' ? Math.abs(layerY(na.layer) - layerY(nb.layer)) : Math.hypot(na.x - nb.x, na.y - nb.y);
    edges.push({ a, b, kind, length, width, layer, net });
  };

  // tracks, collected per layer for T-junction splitting
  const tracks = board.tracks.filter((t) => netSet.has(t.net));
  const trackNodes = tracks.map((t) => [node(t.layer, t.a.x, t.a.y), node(t.layer, t.b.x, t.b.y)] as const);

  // vias: one node per spanned layer, joined vertically
  const viaNodes: { layer: number; id: number; r: number }[] = [];
  board.vias.forEach((v, vi) => {
    if (!netSet.has(v.net)) return;
    let prev = -1;
    for (let l = v.fromLayer; l <= v.toLayer; l++) {
      const id = node(l, v.at.x, v.at.y, { via: vi });
      viaNodes.push({ layer: l, id, r: v.diameter / 2 });
      if (prev >= 0) edge(prev, id, 'via', v.drill, l, v.net);
      prev = id;
    }
  });

  // pads: centre node per copper layer, barrels for through-hole pads
  const padNodes = new Map<number, number[]>();
  board.pads.forEach((p, pi) => {
    if (!netSet.has(p.net) || p.layers.length === 0) return;
    const ids = p.layers.map((l) => node(l, p.at.x, p.at.y, { pad: pi }));
    for (let k = 1; k < ids.length; k++) edge(ids[k - 1]!, ids[k]!, 'thru', p.drill || Math.min(p.size.x, p.size.y), p.layers[k]!, p.net);
    padNodes.set(pi, ids);
  });

  // split tracks where another endpoint or via touches their interior (T-junctions)
  const endpointsByLayer = new Map<number, number[]>();
  for (const n of nodes) {
    const list = endpointsByLayer.get(n.layer) ?? [];
    list.push(n.id);
    endpointsByLayer.set(n.layer, list);
  }
  tracks.forEach((t, ti) => {
    const [ia, ib] = trackNodes[ti]!;
    const cuts: { s: number; id: number }[] = [];
    const dx = t.b.x - t.a.x;
    const dy = t.b.y - t.a.y;
    const l2 = dx * dx + dy * dy;
    for (const id of endpointsByLayer.get(t.layer) ?? []) {
      if (id === ia || id === ib) continue;
      const n = nodes[id]!;
      if (distPointSegment(n, t.a, t.b) > t.width / 2 + 1e-3) continue;
      const s = l2 > 0 ? ((n.x - t.a.x) * dx + (n.y - t.a.y) * dy) / l2 : 0;
      if (s <= 1e-6 || s >= 1 - 1e-6) continue;
      cuts.push({ s, id });
    }
    cuts.sort((p, q) => p.s - q.s);
    let prev = ia;
    for (const c of cuts) {
      edge(prev, c.id, 'track', t.width, t.layer, t.net);
      prev = c.id;
    }
    edge(prev, ib, 'track', t.width, t.layer, t.net);
  });

  // track ends inside pads and vias
  const trackEnds = new Set<number>(trackNodes.flatMap(([a, b]) => [a, b]));
  for (const [pi, ids] of padNodes) {
    const p = board.pads[pi]!;
    ids.forEach((pid) => {
      const layer = nodes[pid]!.layer;
      for (const id of trackEnds) {
        const n = nodes[id]!;
        if (n.layer !== layer || id === pid) continue;
        if (insidePad(p, n.x, n.y, 1e-3)) edge(id, pid, 'pad', Math.min(p.size.x, p.size.y) || 0.3, layer, p.net);
      }
    });
  }
  for (const v of viaNodes) {
    const vn = nodes[v.id]!;
    for (const id of trackEnds) {
      const n = nodes[id]!;
      if (n.layer !== v.layer || id === v.id) continue;
      if (Math.hypot(n.x - vn.x, n.y - vn.y) <= v.r + 1e-3) edge(id, v.id, 'pad', v.r * 2, v.layer, board.vias[vn.via!]!.net);
    }
  }

  // bridges over two-pin parts whose pads sit on two different nets of this graph
  if (bridge && nets.length > 1) {
    for (const fp of board.footprints) {
      const ps = fp.pads.filter((i) => netSet.has(board.pads[i]!.net));
      const netsHere = new Set(ps.map((i) => board.pads[i]!.net));
      if (fp.pads.length !== 2 || ps.length !== 2 || netsHere.size !== 2) continue;
      const a = padNodes.get(ps[0]!)?.[0];
      const b = padNodes.get(ps[1]!)?.[0];
      if (a !== undefined && b !== undefined) edge(a, b, 'bridge', 0.5, nodes[a]!.layer, board.pads[ps[0]!]!.net);
    }
  }

  // zones: every node on the zone layer inside the fill is a member
  const zones: ZoneMembers[] = [];
  const nodeZones = new Map<number, number[]>();
  board.zones.forEach((z, zi) => {
    if (!netSet.has(z.net)) return;
    const members = nodes.filter((n) => n.layer === z.layer && pointInRings(n, z.polygons)).map((n) => n.id);
    if (members.length < 2) return;
    const idx = zones.length;
    zones.push({ zone: zi, layer: z.layer, net: z.net, members });
    for (const m of members) nodeZones.set(m, [...(nodeZones.get(m) ?? []), idx]);
  });

  const adj: number[][] = nodes.map(() => []);
  edges.forEach((e, i) => {
    adj[e.a]!.push(i);
    adj[e.b]!.push(i);
  });
  return { nets, nodes, edges, adj, padNodes, zones, nodeZones };
}

export function insidePad(p: Pad, x: number, y: number, tol = 0): boolean {
  const l = rotateKicad({ x: x - p.at.x, y: y - p.at.y }, -p.angle);
  const hx = p.size.x / 2 + tol;
  const hy = p.size.y / 2 + tol;
  if (p.shape === 'circle') return Math.hypot(l.x, l.y) <= hx;
  if (p.shape === 'oval') {
    const r = Math.min(hx, hy);
    const cx = Math.max(0, Math.abs(l.x) - (hx - r));
    const cy = Math.max(0, Math.abs(l.y) - (hy - r));
    return Math.hypot(cx, cy) <= r;
  }
  return Math.abs(l.x) <= hx && Math.abs(l.y) <= hy;
}

/** Path step: either a real edge or a straight hop through a zone. */
export interface Step {
  from: number;
  to: number;
  edge: number; // -1 for a zone hop
  zone: number; // index into graph.zones for zone hops, else -1
}

export interface SearchTree {
  dist: Float64Array;
  parent: Int32Array;
  step: (Step | undefined)[];
  order: number[];
}

/** Dijkstra from root over edges and zone hops. Via edges get a small penalty. */
export function shortestTree(g: NetGraph, root: number, viaPenalty = 0.5): SearchTree {
  const n = g.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const step: (Step | undefined)[] = new Array(n);
  const done = new Uint8Array(n);
  const order: number[] = [];
  const heap = new MinHeap();
  dist[root] = 0;
  heap.push(root, 0);
  while (heap.size > 0) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    order.push(u);
    const relax = (v: number, cost: number, s: Step) => {
      const d = dist[u]! + cost;
      if (d < dist[v]!) {
        dist[v] = d;
        parent[v] = u;
        step[v] = s;
        heap.push(v, d);
      }
    };
    for (const ei of g.adj[u]!) {
      const e = g.edges[ei]!;
      const v = e.a === u ? e.b : e.a;
      if (done[v]) continue;
      relax(v, e.length + (e.kind === 'via' ? viaPenalty : 0), { from: u, to: v, edge: ei, zone: -1 });
    }
    for (const zi of g.nodeZones.get(u) ?? []) {
      const nu = g.nodes[u]!;
      for (const v of g.zones[zi]!.members) {
        if (done[v] || v === u) continue;
        const nv = g.nodes[v]!;
        relax(v, Math.hypot(nu.x - nv.x, nu.y - nv.y), { from: u, to: v, edge: -1, zone: zi });
      }
    }
  }
  return { dist, parent, step, order };
}

/** Steps from root to target along a search tree, or null when unreachable. */
export function pathTo(tree: SearchTree, target: number): Step[] | null {
  if (!Number.isFinite(tree.dist[target]!)) return null;
  const steps: Step[] = [];
  let v = target;
  while (tree.parent[v]! >= 0) {
    steps.push(tree.step[v]!);
    v = tree.parent[v]!;
  }
  return steps.reverse();
}

class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= key) break;
      ids[i] = ids[p]!;
      keys[i] = keys[p]!;
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0]!;
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length > 0) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        let mk = lastKey;
        if (l < n && keys[l]! < mk) {
          m = l;
          mk = keys[l]!;
        }
        if (r < n && keys[r]! < mk) m = r;
        if (m === i) break;
        ids[i] = ids[m]!;
        keys[i] = keys[m]!;
        i = m;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
