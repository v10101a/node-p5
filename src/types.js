// Port types: number, boolean, trigger, color, vector, image, draw.
// Colors are [r, g, b, a] arrays (0–255), null means none (noFill / noStroke), or an expression string.
// Vectors are { x, y }.

export const TYPE_COLORS = {
  number: '#4f86f7',
  boolean: '#f0a23b',
  trigger: '#ef6b6b',
  color: '#b76ee0',
  vector: '#2fb886',
  image: '#e86aa6',
  draw: '#2a2a2e',
};

export const CATEGORY_COLORS = {
  input: '#cfe3ff',
  math: '#e2d9ff',
  color: '#ffd9ec',
  draw: '#ffe7c2',
  compose: '#d6f5e3',
  custom: '#f3f0e8',
  output: '#2a2a2e',
};

/** can an output of type `out` be wired into an input of type `inp`? */
export function canConnect(out, inp) {
  if (out === inp) return true;
  const ok = {
    number: ['boolean'],
    boolean: ['number', 'trigger'],
    trigger: ['boolean', 'number'],
  };
  return (ok[out] || []).includes(inp);
}
