const CRC_TABLE = makeCrcTable();

function makeCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (0xedb88320 ^ (crc >>> 1)) : crc >>> 1;
    }
    table[index] = crc >>> 0;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= bytes.length) {
    if (u32(view, offset) !== 0x04034b50) break;
    const flags = u16(view, offset + 6);
    const method = u16(view, offset + 8);
    let compressed = u32(view, offset + 18);
    const nameLen = u16(view, offset + 26);
    const extraLen = u16(view, offset + 28);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (flags & 0x8) {
      break;
    }
    const payload = bytes.subarray(dataStart, dataStart + compressed);
    const data = method === 0 ? payload.slice() : await inflateRaw(payload);
    entries.push({ name: name.replace(/\\/g, "/"), data });
    offset = dataStart + compressed;
  }
  return entries;
}

export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + nameBytes.length + file.data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, file.data.length, true);
    localView.setUint32(22, file.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(file.data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }
  const centralStart = offset;
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, files.length, true);
  eocdView.setUint16(10, files.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, centralStart, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const local of locals) {
    out.set(local, cursor);
    cursor += local.length;
  }
  for (const central of centrals) {
    out.set(central, cursor);
    cursor += central.length;
  }
  out.set(eocd, cursor);
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== "undefined") {
    const stream = new DecompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    await writer.write(data as BufferSource);
    await writer.close();
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
    }
    return concat(chunks);
  }
  const zlib = await import("node:zlib");
  return new Uint8Array(zlib.inflateRawSync(data));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface SpreadsheetExtraction {
  sheets: string[];
  headers: string[];
  cellText: string[];
  namedRanges: string[];
  formulas: string[];
  tokens: string[];
}

export async function extractSpreadsheet(bytes: Uint8Array): Promise<SpreadsheetExtraction> {
  const entries = await readZip(bytes);
  const byName = new Map(entries.map((entry) => [entry.name.replace(/^\/+/, ""), entry.data]));
  const decoder = new TextDecoder("utf-8");
  const workbook = decoder.decode(byName.get("xl/workbook.xml") ?? new Uint8Array());
  const shared = decoder.decode(byName.get("xl/sharedStrings.xml") ?? new Uint8Array());
  const sheets = unique(attrValues(workbook, "sheet", "name"));
  const namedRanges = unique(attrValues(workbook, "definedName", "name"));
  const cellText = unique([
    ...tagTexts(shared, "t"),
    ...sheets,
  ]);
  const formulas: string[] = [];
  const headers: string[] = [];
  for (const [name, data] of byName) {
    if (!name.startsWith("xl/worksheets/") || !name.endsWith(".xml")) continue;
    const xml = decoder.decode(data);
    formulas.push(...tagTexts(xml, "f"));
    headers.push(...firstRowTexts(xml, cellText));
  }
  const tokens = unique([...sheets, ...headers, ...cellText, ...namedRanges]);
  return {
    sheets: unique(sheets),
    headers: unique(headers),
    cellText: unique(cellText),
    namedRanges: unique(namedRanges),
    formulas: unique(formulas),
    tokens,
  };
}

export function createXlsxFixture(sheets: string[], extraText: string[] = []): Uint8Array {
  const encoder = new TextEncoder();
  const allText = unique([...sheets, ...extraText]);
  const shared = `<?xml version="1.0"?><sst>${allText.map((text) => `<si><t>${escapeXml(text)}</t></si>`).join("")}</sst>`;
  const workbook = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
    sheets.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")
  }</sheets></workbook>`;
  const sheetXml = `<?xml version="1.0"?><worksheet><sheetData><row r="1">${
    allText.map((_, index) => `<c t="s"><v>${index}</v></c>`).join("")
  }</row></sheetData></worksheet>`;
  return zipStore([
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/sharedStrings.xml", data: encoder.encode(shared) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheetXml) },
  ]);
}

function attrValues(xml: string, tag: string, attr: string): string[] {
  const values: string[] = [];
  const tagRe = new RegExp(`<${tag}\\b([^>]*)\\/?>`, "gi");
  const attrRe = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "i");
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(xml))) {
    const found = match[1]?.match(attrRe);
    if (found?.[1]) values.push(found[1]);
  }
  return values;
}

function tagTexts(xml: string, tag: string): string[] {
  const values: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    if (match[1]?.trim()) values.push(match[1].trim());
  }
  return values;
}

function firstRowTexts(xml: string, shared: string[]): string[] {
  const row = xml.match(/<row\b[^>]*r="1"[^>]*>([\s\S]*?)<\/row>/i)?.[1] ?? "";
  const indices = [...row.matchAll(/<v>(\d+)<\/v>/gi)].map((match) => Number(match[1]));
  return indices.map((index) => shared[index]).filter((item): item is string => Boolean(item));
}

function unique(values: string[]): string[] {
  const next = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  next.sort((left, right) => left.localeCompare(right));
  return next;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
