function escapeCell(val) {
  if (val === null || val === undefined) return '';
  if (Array.isArray(val)) {
    // Centroid format
    val = val.join(', ');
  }
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function tractsToCsv(tracts, columns) {
  const header = columns.join(',');
  const rows = tracts.map(t =>
    columns.map(c => escapeCell(t[c])).join(',')
  );
  return [header, ...rows].join('\n');
}

export function downloadCsv(csv, filename = 'tracts.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
