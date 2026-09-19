// Parser CSV zgodny z RFC 4180 (cudzysłowy, przecinki i nowe linie w polach).
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  const columns = (rows.shift() || []).map(s => s.trim());
  const out = rows
    .filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(columns.map((c, k) => [c, (r[k] ?? '').trim()])));
  out.columns = columns;
  return out;
}

export function toCSV(columns, rows) {
  const q = (v) => {
    v = v == null ? '' : String(v);
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  return [columns.join(','), ...rows.map(r => columns.map(c => q(r[c])).join(','))].join('\n');
}
