export type PortType = 'number' | 'boolean' | 'trigger' | 'color' | 'vector' | 'image' | 'draw';

export type ColorValue = [number, number, number, number] | null; // null = none (noFill / noStroke)
export type VectorValue = { x: number; y: number };

export interface PortDef {
  name: string;
  type: PortType;
  label?: string;
  /** default inline value when nothing is connected */
  default?: any;
  /** inline control shown when unconnected */
  widget?: 'number' | 'color' | 'bool' | 'vector' | 'none';
  min?: number;
  max?: number;
  step?: number;
  /** variadic inputs expand to name0, name1, ... with one trailing empty slot */
  variadic?: boolean;
}

export interface ParamDef {
  name: string;
  label?: string;
  widget: 'select' | 'text' | 'code' | 'number' | 'bool' | 'color' | 'ports';
  options?: string[];
  default?: any;
}

export type Category = 'input' | 'math' | 'color' | 'draw' | 'compose' | 'custom' | 'output';

export interface NodeDef {
  type: string;
  label: string;
  category: Category;
  description?: string;
  inputs: PortDef[];
  outputs: PortDef[];
  params?: ParamDef[];
  width?: number;
  /** keep exactly one of these in a patch, created automatically */
  singleton?: boolean;
  compile: (c: CompileCtx) => CompileResult;
}

export interface CompileCtx {
  node: NodeData;
  /** expression for an input port (variable name or literal) */
  in: (port: string) => string;
  connected: (port: string) => boolean;
  /** true when unconnected and inline value equals the port default */
  isDefault: (port: string) => boolean;
  param: (name: string) => any;
  /** raw inline value of an input port (number | string expression | color array | null ...) */
  raw: (port: string) => any;
  /** like in(), but for use as a whole call argument: inline expressions are not parenthesised */
  arg: (port: string) => string;
  /** the variable name for an output (single output: node name; multi: name_port) */
  v: (port?: string) => string;
  /** statements drawing the given variadic draw inputs into target T ('' for main canvas, 'buf.' for graphics) */
  drawInputs: (prefix: string, T: string) => string[];
  /** statements for a single draw input */
  drawIn: (port: string, T: string) => string[];
  /** unique identifier-safe id for per-node globals */
  gid: string;
  addGlobal: (line: string) => void;
  addSetup: (line: string) => void;
  helper: (name: string) => void;
  /** a reference to the main canvas object for custom code */
  mainRef: string;
  /** compiling for the live preview (enables probes / hot canvas resize) */
  live: boolean;
}

export interface CompileResult {
  /** per-frame statements emitted before the const declarations (state updates etc) */
  pre?: string[];
  /** expressions for pure outputs */
  values?: Record<string, string>;
  /** statements producing this node's drawing into target T */
  draw?: (T: string) => string[];
  /** statements to emit at this node's position in topological order (render buffers, canvas) */
  stmts?: string[];
}

export interface NodeData {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  params: Record<string, any>;
  /** custom nodes carry their own port definitions */
  ports?: { inputs: PortDef[]; outputs: PortDef[] };
}

export interface EdgeEnd {
  node: string;
  port: string;
}
export interface EdgeData {
  id: string;
  from?: EdgeEnd; // output side
  to?: EdgeEnd; // input side
  fromPos?: { x: number; y: number }; // loose output end
  toPos?: { x: number; y: number }; // loose input end
}

export interface NoteData {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  color: string;
}

export interface GroupData {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  color: string;
}

export interface PatchJSON {
  version: 1;
  nodes: NodeData[];
  edges: EdgeData[];
  notes: NoteData[];
  groups: GroupData[];
}

export const TYPE_COLORS: Record<PortType, string> = {
  number: '#4f86f7',
  boolean: '#f0a23b',
  trigger: '#ef6b6b',
  color: '#b76ee0',
  vector: '#2fb886',
  image: '#e86aa6',
  draw: '#2a2a2e',
};

export const CATEGORY_COLORS: Record<Category, string> = {
  input: '#cfe3ff',
  math: '#e2d9ff',
  color: '#ffd9ec',
  draw: '#ffe7c2',
  compose: '#d6f5e3',
  custom: '#f3f0e8',
  output: '#2a2a2e',
};

export function canConnect(out: PortType, inp: PortType): boolean {
  if (out === inp) return true;
  const ok: Record<string, PortType[]> = {
    number: ['boolean'],
    boolean: ['number', 'trigger'],
    trigger: ['boolean', 'number'],
  };
  return (ok[out] || []).includes(inp);
}
