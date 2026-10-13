/** CSV mínimo y robusto: comillas, saltos de línea dentro de comillas y separador ; , o tab. */

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = [";", ",", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0].n > 0 ? counts[0].d : ",";
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const escapeCell = (v: unknown, delimiter: string) => {
  if (v === null || v === undefined) return "";
  // Los números se escriben con coma decimal para que Excel en español los tome como número.
  const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con BOM y punto y coma: lo abre bien Excel configurado en español. */
export function toCsv(rows: readonly (readonly unknown[])[], delimiter = ";"): string {
  return "﻿" + rows.map((r) => r.map((c) => escapeCell(c, delimiter)).join(delimiter)).join("\r\n") + "\r\n";
}
