function xmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]);
  const line = (r: Record<string, unknown>) =>
    keys
      .map((k) => {
        const raw = r[k] == null ? "" : String(r[k]);
        // Neutraliza fórmulas de hoja de cálculo (=, +, -, @, tab, CR al inicio).
        const v = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
        return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
      })
      .join(",");
  return [keys.join(","), ...rows.map(line)].join("\n");
}

export function toSpreadsheetXml(sheet: string, rows: Record<string, unknown>[]): string {
  const keys = rows[0] ? Object.keys(rows[0]) : ["vacio"];
  const cells = (vals: string[]) =>
    vals
      .map((v) => `<Cell><Data ss:Type="String">${xmlEscape(v)}</Data></Cell>`)
      .join("");
  const body = [
    `<Row>${cells(keys)}</Row>`,
    ...rows.map((r) => `<Row>${cells(keys.map((k) => String(r[k] ?? "")))}</Row>`),
  ].join("");
  return `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${xmlEscape(sheet)}"><Table>${body}</Table></Worksheet>
</Workbook>`;
}

function crc32(data: Uint8Array) {
  let c = 0xffffffff;
  for (const byte of data) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

export function zipStore(files: Array<{ name: string; data: Uint8Array | string }>): Uint8Array {
  const chunks: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = Buffer.isBuffer(file.data)
      ? file.data
      : Buffer.from(typeof file.data === "string" ? file.data : Buffer.from(file.data));
    const crc = crc32(data);
    const local = Buffer.concat([
      Buffer.from("PK\u0003\u0004"),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    chunks.push(local);
    centrals.push(
      Buffer.concat([
        Buffer.from("PK\u0001\u0002"),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.concat([
    Buffer.from("PK\u0005\u0006"),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...chunks, central, end]);
}

export function toXlsx(sheet: string, rows: Record<string, unknown>[]): Uint8Array {
  const keys = rows[0] ? Object.keys(rows[0]) : ["vacio"];
  const cell = (r: number, c: number, text: string) =>
    `<c r="${String.fromCharCode(65 + c)}${r}" t="inlineStr"><is><t>${xmlEscape(text)}</t></is></c>`;
  const sheetRows = [
    `<row r="1">${keys.map((k, i) => cell(1, i, k)).join("")}</row>`,
    ...rows.map(
      (row, idx) =>
        `<row r="${idx + 2}">${keys.map((k, i) => cell(idx + 2, i, String(row[k] ?? ""))).join("")}</row>`,
    ),
  ].join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return zipStore([
    { name: "[Content_Types].xml", data: types },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbook },
    { name: "xl/_rels/workbook.xml.rels", data: rels },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
  ]);
}

export function toSimplePdf(
  title: string,
  lines: string[],
  opts: { font?: "Helvetica" | "Courier"; size?: number; lineHeight?: number } = {},
): Uint8Array {
  const font = opts.font ?? "Helvetica";
  const size = opts.size ?? 10;
  const lineHeight = opts.lineHeight ?? 14;
  const perPage = Math.floor((792 - 80) / lineHeight);
  const all = [title, "", ...lines];
  const pages: string[][] = [];
  for (let i = 0; i < all.length; i += perPage) pages.push(all.slice(i, i + perPage));
  // Fuente WinAnsi: se escribe en latin1 (tildes y ñ), lo demás se degrada a "?".
  const esc = (l: string) =>
    l.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    `2 0 obj << /Type /Pages /Kids [${pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >> endobj`,
    "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /" + font + " /Encoding /WinAnsiEncoding >> endobj",
    "4 0 obj << >> endobj",
    "5 0 obj << >> endobj",
  ];
  pages.forEach((chunk, i) => {
    const stream = chunk
      .map((l, row) => `BT /F1 ${size} Tf 40 ${760 - row * lineHeight} Td (${esc(l)}) Tj ET`)
      .join("\n");
    const pageNum = 6 + i * 2;
    objects.push(
      `${pageNum} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${pageNum + 1} 0 R /Resources << /Font << /F1 3 0 R >> >> >> endobj`,
      `${pageNum + 1} 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    );
  });
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  let offset = chunks[0].length;
  for (const obj of objects) {
    offsets.push(offset);
    chunks.push(`${obj}\n`);
    offset += obj.length + 1;
  }
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i += 1) {
    chunks.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`,
  );
  return new Uint8Array(Buffer.from(chunks.join(""), "latin1"));
}
