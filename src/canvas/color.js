export function colorCss(c) {
  if (!c || !Array.isArray(c)) return 'transparent';
  const a = c[3] === undefined ? 1 : c[3] / 255;
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;
}
export function toHex(c) {
  if (!c) return '#000000';
  return '#' + [c[0], c[1], c[2]].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
export function fromHex(h, alpha = 255) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), alpha];
}
