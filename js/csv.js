/* CSV を行と列に分ける（引用符、引用符の中のカンマ・改行、先頭の BOM に対応）。 */
function parseCsv(text) {
  var s = String(text == null ? '' : text);
  if (s.charCodeAt(0) === 65279) s = s.slice(1);
  var rows = [], row = [], cell = '', inQ = false, i = 0, c;
  while (i < s.length) {
    c = s.charAt(i);
    if (inQ) {
      if (c === '"') {
        if (s.charAt(i + 1) === '"') { cell += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(cell); cell = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
    cell += c; i++;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (v) { return v !== ''; }); });
}
/* 定例会の参加者名簿（CSV）から、番号(A)・氏名(B)・所属エリア(K)・業種(H)・PR(O,Q,S) の7列だけを取り出す。
 * 所属エリア(K)が空の行はゲストなので除く */
function pickParticipantColumns(rows) {
  return rows.filter(function (r) { return /^\d+$/.test(String(r[0] || '').trim()) && String(r[10] || '').trim(); })
    .map(function (r) { return [r[0] || '', r[1] || '', r[10] || '', r[7] || '', r[14] || '', r[16] || '', r[18] || '']; });
}
if (typeof module !== 'undefined') { module.exports = parseCsv; module.exports.pickParticipantColumns = pickParticipantColumns; }
