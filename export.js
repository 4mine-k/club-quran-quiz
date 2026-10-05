// export.js — build Excel (.xlsx) and CSV from quiz data, pure Node (zlib only).
// An .xlsx file is a ZIP archive of XML parts. We build a minimal valid workbook.

const zlib = require("zlib");

// ---------- Minimal ZIP writer (store + deflate) ----------
function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function zipFiles(files) {
  // files: [{ name, data(Buffer) }]
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const raw = f.data;
    const comp = zlib.deflateRawSync(raw);
    const useDeflate = comp.length < raw.length;
    const stored = useDeflate ? comp : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    // Local file header
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version
    local.writeUInt16LE(0x0800, 6); // UTF-8 flag
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, stored);

    // Central directory record
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(stored.length, 20);
    cd.writeUInt32LE(raw.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + stored.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ---------- XML helpers ----------
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Build a worksheet XML from rows (array of arrays). Values can be string or number.
function sheetXml(rows) {
  let body = "";
  rows.forEach((row, r) => {
    const rn = r + 1;
    let cells = "";
    row.forEach((val, c) => {
      const ref = colLetter(c) + rn;
      if (typeof val === "number" && isFinite(val)) {
        cells += `<c r="${ref}"><v>${val}</v></c>`;
      } else {
        cells += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(val)}</t></is></c>`;
      }
    });
    body += `<row r="${rn}">${cells}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function colLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Build the full xlsx given named sheets: [{ name, rows }]
function buildXlsx(sheets) {
  const files = [];

  files.push({
    name: "[Content_Types].xml",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map(
          (s, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("")}</Types>`,
      "utf8"
    ),
  });

  files.push({
    name: "_rels/.rels",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      "utf8"
    ),
  });

  files.push({
    name: "xl/workbook.xml",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
        .map(
          (s, i) =>
            `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
        )
        .join("")}</sheets></workbook>`,
      "utf8"
    ),
  });

  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data: Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map(
          (s, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join("")}</Relationships>`,
      "utf8"
    ),
  });

  sheets.forEach((s, i) => {
    files.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(s.rows), "utf8"),
    });
  });

  return zipFiles(files);
}

// ---------- Build quiz-specific exports ----------
function buildRows(players, questions) {
  // Summary sheet: ranked by score, then time
  const ranked = players
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.totalTimeMs - b.totalTimeMs));

  const summaryHeader = ["الترتيب", "الاسم", "النقاط", "إجابات صحيحة", "عدد الأسئلة", "الوقت الكلي (ث)", "أنهى؟"];
  const summaryRows = [summaryHeader];
  ranked.forEach((p, i) => {
    summaryRows.push([
      i + 1,
      p.name,
      p.score,
      p.correctCount,
      questions.length,
      Number((p.totalTimeMs / 1000).toFixed(1)),
      p.finished ? "نعم" : "لا",
    ]);
  });

  // Detailed answers sheet: one row per player, with each question's answer + correctness
  const detailHeader = ["الاسم", "النقاط", "إجابات صحيحة"];
  questions.forEach((q, idx) => {
    detailHeader.push(`س${idx + 1}: الإجابة`);
    detailHeader.push(`س${idx + 1}: صحيحة؟`);
    detailHeader.push(`س${idx + 1}: نقاط`);
  });
  const detailRows = [detailHeader];
  ranked.forEach((p) => {
    const row = [p.name, p.score, p.correctCount];
    questions.forEach((q) => {
      const ans = p.answers.find((a) => a.questionId === q.id);
      if (ans) {
        row.push(ans.answer === "" ? "(بدون إجابة)" : ans.answer);
        row.push(ans.isCorrect ? "✓" : "✗");
        row.push(ans.points);
      } else {
        row.push("—", "—", 0);
      }
    });
    detailRows.push(row);
  });

  return { summaryRows, detailRows };
}

function toXlsx(players, questions) {
  const { summaryRows, detailRows } = buildRows(players, questions);
  return buildXlsx([
    { name: "النتائج", rows: summaryRows },
    { name: "تفاصيل الإجابات", rows: detailRows },
  ]);
}

function toCsv(players, questions) {
  const { summaryRows } = buildRows(players, questions);
  const esc = (v) => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = summaryRows.map((r) => r.map(esc).join(","));
  // UTF-8 BOM so Excel reads Arabic correctly
  return "\uFEFF" + lines.join("\r\n");
}

module.exports = { toXlsx, toCsv };
