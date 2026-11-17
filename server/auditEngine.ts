import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  AuditSettings,
  EmployeeAuditRecord,
  ManualMatchCandidate,
  VerificationStatus,
} from '../src/types/audit.ts';

// Configure PDF.js worker for Node.js execution
const workerPath = path.resolve(
  process.cwd(),
  'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
);
pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

export interface ExcelEmployeeRow {
  rowIndex: number;
  worksheetName?: string;
  empCode: string;
  name: string;
  department: string;
  uan: string | null;
  ipNumber: string | null;
  attendanceDays: number;
  workingDays: number;
  grossWages: number;
  excelEE: number | null;
  excelIP: number | null;
}

export interface EpfEcrRow {
  lineNumber: number;
  uan: string | null;
  name: string;
  epfWages: number | null;
  epfEE: number | null;
}

export interface EsicIpRow {
  lineNumber: number;
  ipNumber: string | null;
  name: string;
  paidDays: number | null;
  wages: number | null;
  esicIP: number | null;
  reason?: string | null;
}

interface PdfTextToken {
  x: number;
  y: number;
  str: string;
}

interface PdfPageTokens {
  page: number;
  width: number;
  height: number;
  tokens: PdfTextToken[];
}

function cleanText(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/\s+/g, ' ').trim();
}

function parseNullableNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.round(val) : null;
  }
  const str = cleanText(val);
  if (
    !str ||
    str === '-' ||
    str === '--' ||
    str === '—' ||
    str.toLowerCase() === 'blank' ||
    str.toLowerCase() === 'nil' ||
    str.toLowerCase() === 'n/a' ||
    str.toLowerCase() === 'na' ||
    str.toLowerCase() === 'null'
  ) {
    return null;
  }
  const cleaned = str.replace(/[*#₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function normalizeIdDigits(val: unknown, expectedLen?: number): string | null {
  if (val === null || val === undefined) return null;
  let raw = '';
  if (typeof val === 'number' && Number.isFinite(val)) {
    raw = Math.trunc(val).toString();
  } else {
    raw = cleanText(val);
  }
  if (!raw || /^(blank|na|n\/a|unmapped|-+|nil|null)$/i.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits || /^0+$/.test(digits)) return null;
  if (expectedLen && digits.length !== expectedLen) {
    if (digits.length < expectedLen - 2) return null;
  }
  return digits;
}

export function normalizePersonName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|miss|shri|smt|kumari|dr|md)\b\.?/g, (m) =>
      m.startsWith('md') ? 'mohammed' : ''
    )
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[n];
}

export function computeNameSimilarity(nameA: string, nameB: string): number {
  const a = normalizePersonName(nameA);
  const b = normalizePersonName(nameB);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const tokensA = a.split(' ').filter(Boolean);
  const tokensB = b.split(' ').filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const sortedA = [...tokensA].sort().join(' ');
  const sortedB = [...tokensB].sort().join(' ');
  if (sortedA === sortedB) return 96;

  // Token overlap + initial prefix matching (handles First Last vs First Middle Last)
  let matchedWeight = 0;
  const usedB = new Set<number>();
  for (const ta of tokensA) {
    let bestTokenScore = 0;
    let bestIdx = -1;
    for (let j = 0; j < tokensB.length; j++) {
      if (usedB.has(j)) continue;
      const tb = tokensB[j];
      if (ta === tb) {
        bestTokenScore = 1;
        bestIdx = j;
        break;
      }
      if ((ta.length === 1 && tb.startsWith(ta)) || (tb.length === 1 && ta.startsWith(tb))) {
        if (0.8 > bestTokenScore) {
          bestTokenScore = 0.8;
          bestIdx = j;
        }
      } else {
        const dist = levenshtein(ta, tb);
        const maxL = Math.max(ta.length, tb.length);
        const sim = 1 - dist / maxL;
        if (sim >= 0.7 && sim > bestTokenScore) {
          bestTokenScore = sim;
          bestIdx = j;
        }
      }
    }
    if (bestIdx !== -1) {
      usedB.add(bestIdx);
      matchedWeight += bestTokenScore;
    }
  }

  const maxTokens = Math.max(tokensA.length, tokensB.length);
  const minTokens = Math.min(tokensA.length, tokensB.length);
  const tokenScore = (matchedWeight / maxTokens) * 100;

  // Handle First+Last matching First+FatherName+Last cleanly (all tokens of shorter name found in longer name)
  let subsetBonusScore = 0;
  if (minTokens >= 2 && maxTokens - minTokens <= 2) {
    const subsetRatio = matchedWeight / minTokens;
    if (subsetRatio >= 0.85) {
      subsetBonusScore = subsetRatio * 88 - (maxTokens - minTokens) * 3;
    }
  }

  const distDirect = levenshtein(a, b);
  const directScore = (1 - distDirect / Math.max(a.length, b.length)) * 100;
  const distSorted = levenshtein(sortedA, sortedB);
  const sortedScore = (1 - distSorted / Math.max(sortedA.length, sortedB.length)) * 100;

  let finalScore = Math.round(Math.max(tokenScore, subsetBonusScore, directScore, sortedScore));
  // If both names have 2+ words and fewer than 1.4 tokens actually matched (e.g. only shared first name "Prakash Gaud" vs "Prakash Saw"),
  // prevent string edit distance on the shared word from causing false-positive matches.
  if (minTokens >= 2 && matchedWeight < 1.4) {
    finalScore = Math.min(finalScore, 62);
  }
  return finalScore;
}

function isSummaryOrBlankName(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (!n || n.length < 2) return true;
  if (/^\d+$/.test(n)) return true;
  return /^(total|total amount|grand total|sub total|subtotal|summary|prepared by|checked by|approved by|signature|page \d+|sl\.?\s*no|sr\.?\s*no|names?|employee name|name of the person|emp\.?\s*code\s*no\.?)$/i.test(
    n
  );
}

/**
 * Scores a worksheet to distinguish true tabular Salary/Payroll sheets
 * from Salary Slip print sheets or Daily IN/OUT Attendance punch grids.
 */
function scorePayrollSheet(sheetName: string, grid: unknown[][]): { score: number; headerIdx: number } {
  if (grid.length < 2) return { score: -100, headerIdx: 0 };

  let isSalarySlip = false;
  let isAttendancePunch = false;
  let hasPayrollDataIds = false;

  const scanTextRows = Math.min(20, grid.length);
  for (let i = 0; i < scanTextRows; i++) {
    const row = grid[i] ?? [];
    const rowLower = row.map((c) => cleanText(c).toLowerCase()).filter(Boolean);
    const joined = rowLower.join(' ');
    if (
      joined.includes('salary slip') ||
      (rowLower.includes('earnings') && rowLower.includes('deductions')) ||
      joined.includes('empl. name :-')
    ) {
      isSalarySlip = true;
    }
    if (
      joined.includes('attendance sheet') ||
      (rowLower.includes('in') && rowLower.includes('tue') && rowLower.includes('wed'))
    ) {
      isAttendancePunch = true;
    }
    for (const cell of row) {
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        const s = Math.trunc(cell).toString();
        if (/^\d{12}$/.test(s) || /^\d{10}$/.test(s)) hasPayrollDataIds = true;
      } else if (typeof cell === 'string') {
        const s = cell.trim();
        if (/^\d{12}$/.test(s) || /^\d{10}$/.test(s)) hasPayrollDataIds = true;
      }
    }
  }

  let bestHeaderIdx = 0;
  let bestHeaderScore = -1;
  const headerScanLimit = Math.min(25, grid.length);

  for (let i = 0; i < headerScanLimit; i++) {
    const row = grid[i] ?? [];
    let rowScore = 0;
    let nonNumericHeaders = 0;

    for (const cell of row) {
      const txt = cleanText(cell).toLowerCase();
      if (!txt || /^\d+$/.test(txt)) continue;
      nonNumericHeaders++;

      if (/^(names?|emp\.?\s*names?|employee\s*names?|staff\s*names?|worker\s*names?)$/.test(txt)) {
        rowScore += 12;
      } else if (txt.includes('name')) {
        rowScore += 5;
      }
      if (/\b(pf\s*12%?|epf\s*12%?|epf|ee)\b/.test(txt) && !txt.includes('calculation')) {
        rowScore += 8;
      }
      if (/\b(esic\s*0?\.?75%?|esi\s*0?\.?75%?|esic|esi)\b/.test(txt)) {
        rowScore += 8;
      }
      if (/\b(uan|esic\s*no|ip\s*no)\b/.test(txt)) {
        rowScore += 6;
      }
      if (/\b(total\s*gross|gross|basic|net\s*salary|net\s*pay|sr\.?\s*no)\b/.test(txt)) {
        rowScore += 3;
      }
    }

    if (nonNumericHeaders < 3) rowScore = Math.min(rowScore, 2);
    if (rowScore > bestHeaderScore) {
      bestHeaderScore = rowScore;
      bestHeaderIdx = i;
    }
  }

  let sheetScore = bestHeaderScore;
  if (/salary|payroll|wage|register/i.test(sheetName)) sheetScore += 12;
  if (hasPayrollDataIds) sheetScore += 10;
  if (isSalarySlip) sheetScore -= 60;
  if (isAttendancePunch) sheetScore -= 50;

  return { score: sheetScore, headerIdx: bestHeaderIdx };
}

function detectCsvDelimiter(csvText: string): string {
  const sampleLines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 6);
  const candidates = [',', ';', '\t'];
  let bestDelim = ',';
  let bestScore = -1;

  for (const delim of candidates) {
    let counts: number[] = [];
    for (const line of sampleLines) {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (!inQuotes && ch === delim) {
          count++;
        }
      }
      counts.push(count);
    }
    const maxCount = Math.max(0, ...counts);
    const nonZeroLines = counts.filter((c) => c > 0).length;
    const score = maxCount * 2 + nonZeroLines * 5;
    if (maxCount > 0 && score > bestScore) {
      bestScore = score;
      bestDelim = delim;
    }
  }
  return bestDelim;
}

function isLikelyCsvInput(buffer: Buffer, fileName: string): boolean {
  if (/\.csv$/i.test(fileName)) return true;
  if (buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b) return false; // ZIP (.xlsx)
  if (buffer.length >= 4 && buffer[0] === 0xd0 && buffer[1] === 0xcf) return false; // OLE2 (.xls)
  const head = buffer.subarray(0, Math.min(512, buffer.length)).toString('utf8');
  return head.includes('\n') && (head.includes(',') || head.includes(';') || head.includes('\t'));
}

const PERIOD_MONTHS = [
  ['January', 'Jan'],
  ['February', 'Feb'],
  ['March', 'Mar'],
  ['April', 'Apr'],
  ['May', 'May'],
  ['June', 'Jun'],
  ['July', 'Jul'],
  ['August', 'Aug'],
  ['September', 'Sep'],
  ['October', 'Oct'],
  ['November', 'Nov'],
  ['December', 'Dec'],
] as const;

function formatPeriod(month: number, year: number): string | null {
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2200
    ? `${PERIOD_MONTHS[month - 1][0]} ${year}`
    : null;
}

function parseMonthYear(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;

  const monthPattern = PERIOD_MONTHS.map(([full, short]) => `${full}|${short}`).join('|');
  const monthFirst = text.match(new RegExp(`\\b(${monthPattern})[\\s._/-]+(20\\d{2})\\b`, 'i'));
  if (monthFirst) {
    const month = PERIOD_MONTHS.findIndex(
      ([full, short]) => full.toLowerCase() === monthFirst[1].toLowerCase() || short.toLowerCase() === monthFirst[1].toLowerCase()
    ) + 1;
    return formatPeriod(month, Number(monthFirst[2]));
  }

  const yearFirst = text.match(/\b(20\d{2})[\s._/-]+(0?[1-9]|1[0-2])\b/);
  if (yearFirst) return formatPeriod(Number(yearFirst[2]), Number(yearFirst[1]));

  const monthNumberFirst = text.match(/\b(0?[1-9]|1[0-2])[\s._/-]+(20\d{2})\b/);
  if (monthNumberFirst) return formatPeriod(Number(monthNumberFirst[1]), Number(monthNumberFirst[2]));
  return null;
}

/** Detect the payroll period from the workbook's own period labels, then its filename. */
export function detectPayrollPeriod(buffer: Buffer, fileName: string): string | null {
  let workbook: XLSX.WorkBook;
  try {
    if (isLikelyCsvInput(buffer, fileName)) {
      workbook = XLSX.read(buffer.toString('utf8').replace(/^\uFEFF/, ''), {
        type: 'string',
        raw: true,
        cellDates: true,
      });
    } else {
      workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    }
  } catch {
    workbook = { SheetNames: [], Sheets: {} } as XLSX.WorkBook;
  }

  const labeledPeriods: string[] = [];
  const otherWorkbookPeriods: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex] ?? [];
      const text = row.map(cleanText).filter(Boolean).join(' ');
      const hasPeriodCue = /payroll|salary|wage|contribution|challan|period|month/i.test(text);
      for (const cell of row) {
        const detected = parseMonthYear(cell);
        if (detected) (hasPeriodCue ? labeledPeriods : otherWorkbookPeriods).push(detected);
        if (cell instanceof Date && hasPeriodCue) {
          const datePeriod = formatPeriod(cell.getMonth() + 1, cell.getFullYear());
          if (datePeriod) labeledPeriods.push(datePeriod);
        }
      }

      // Handle spreadsheets that store payroll month and year in separate columns.
      for (let headerIndex = Math.max(0, rowIndex - 3); headerIndex < rowIndex; headerIndex += 1) {
        const headers = (grid[headerIndex] ?? []).map(cleanText);
        const monthColumn = headers.findIndex((value) => /^(payroll|salary)?\s*month$/i.test(value));
        const yearColumn = headers.findIndex((value) => /^(payroll|salary)?\s*year$/i.test(value));
        if (monthColumn < 0 || yearColumn < 0) continue;

        const rawMonth = row[monthColumn];
        const monthNumber = Number(rawMonth);
        const monthFromName = PERIOD_MONTHS.findIndex(
          ([full, short]) => full.toLowerCase() === cleanText(rawMonth).toLowerCase() || short.toLowerCase() === cleanText(rawMonth).toLowerCase()
        ) + 1;
        const month = Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
          ? monthNumber
          : monthFromName;
        const year = Number(row[yearColumn]);
        const splitPeriod = formatPeriod(month, year);
        if (splitPeriod) labeledPeriods.push(splitPeriod);
      }
    }
    const sheetPeriod = parseMonthYear(sheetName);
    if (sheetPeriod) otherWorkbookPeriods.push(sheetPeriod);
  }

  if (labeledPeriods.length) return labeledPeriods[0];
  if (otherWorkbookPeriods.length) return otherWorkbookPeriods[0];
  return parseMonthYear(fileName);
}

/**
 * Parses an Attendance / Salary Excel (.xlsx / .xls) or CSV (.csv) workbook into structured rows.
 * Selects the true tabular payroll worksheet, handles plural headers ("Names"),
 * statutory deduction headers ("PF 12%", "ESIC 0.75%"), unlabeled UAN/IP/Dept columns,
 * UTF-8 BOM / multi-delimiter CSVs, and distinguishes Blank cells from numeric 0.
 */
export function parseAttendanceExcel(
  buffer: Buffer,
  fileName: string
): { rows: ExcelEmployeeRow[]; warnings: string[] } {
  const warnings: string[] = [];
  let workbook: XLSX.WorkBook;

  if (isLikelyCsvInput(buffer, fileName)) {
    const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
    if (!csvText.trim()) {
      return { rows: [], warnings: ['Uploaded CSV file is empty.'] };
    }
    const delimiter = detectCsvDelimiter(csvText);
    workbook = XLSX.read(csvText, {
      type: 'string',
      FS: delimiter,
      raw: true,
      cellDates: false,
    });
  } else {
    workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  }

  if (!workbook.SheetNames.length) {
    return { rows: [], warnings: ['Workbook contains no readable worksheets.'] };
  }

  if (workbook.SheetNames.length > 1) {
    const payrollSheetNames: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        raw: true,
      });
      if (!grid.length) continue;

      const evaluated = scorePayrollSheet(sheetName, grid);
      const header = grid[evaluated.headerIdx] ?? [];
      const nameColumn = header.findIndex((cell) => {
        const value = cleanText(cell).toLowerCase();
        return /\bname\b/.test(value) && !/father|husband|company|branch|bank|department|dept/.test(value);
      });
      const hasContributionOrMemberIdHeader = header.some((cell) =>
        /\b(pf|epf|esic|esi|uan|ip\s*(?:no|number|id)?)\b/i.test(cleanText(cell))
      );
      if (nameColumn === -1 || !hasContributionOrMemberIdHeader || evaluated.score < 10) {
        continue;
      }

      const employeeRows = grid.slice(evaluated.headerIdx + 1).filter((row) => {
        const name = cleanText(row[nameColumn]);
        return /[a-z]/i.test(name) && name.length >= 3 && !isSummaryOrBlankName(name);
      });
      if (employeeRows.length >= 3) payrollSheetNames.push(sheetName);
    }

    const namedPayrollSheets = payrollSheetNames.filter(
      (sheetName) => !/^sheet\s*\d*$/i.test(sheetName.trim())
    );
    // A default-named sheet can be a consolidated copy of the named
    // contractor sheets. Prefer the named sheets when they are present.
    const sheetsToParse = namedPayrollSheets.length > 0 ? namedPayrollSheets : payrollSheetNames;

    if (sheetsToParse.length > 0) {
      const combinedRows: ExcelEmployeeRow[] = [];
      const combinedWarnings: string[] = [];

      for (const sheetName of sheetsToParse) {
        const sourceSheet = workbook.Sheets[sheetName];
        if (!sourceSheet) continue;

        const oneSheetWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(oneSheetWorkbook, sourceSheet, sheetName);
        const oneSheetBuffer = XLSX.write(oneSheetWorkbook, {
          type: 'buffer',
          bookType: 'xlsx',
        }) as Buffer;
        const result = parseAttendanceExcel(oneSheetBuffer, `${sheetName}.xlsx`);

        combinedRows.push(
          ...result.rows.map((row) => ({ ...row, worksheetName: sheetName }))
        );
        combinedWarnings.push(...result.warnings);
      }

      if (combinedRows.length > 0) {
        const duplicateIdentifierCount = (field: 'uan' | 'ipNumber') => {
          const counts = new Map<string, number>();
          for (const row of combinedRows) {
            const value = row[field];
            if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
          }
          return [...counts.values()].filter((count) => count > 1).length;
        };
        const duplicateUans = duplicateIdentifierCount('uan');
        const duplicateIps = duplicateIdentifierCount('ipNumber');
        if (duplicateUans > 0 || duplicateIps > 0) {
          combinedWarnings.push(
            `Found ${duplicateUans} repeated UANs and ${duplicateIps} repeated ESIC IP numbers in the payroll sheets. Review these records before relying on the comparison.`
          );
        }

        return {
          rows: combinedRows,
          warnings: [...new Set(combinedWarnings)],
        };
      }
    }
  }

  let bestRows: unknown[][] = [];
  let headerIdx = 0;
  let bestSheetScore = -Infinity;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });
    if (grid.length === 0) continue;

    const evaluated = scorePayrollSheet(sheetName, grid);
    if (evaluated.score > bestSheetScore) {
      bestSheetScore = evaluated.score;
      bestRows = grid;
      headerIdx = evaluated.headerIdx;
    }
  }

  if (bestRows.length === 0) {
    return { rows: [], warnings: ['Uploaded spreadsheet is empty.'] };
  }

  const rawHeaders = (bestRows[headerIdx] ?? []).map((c) => cleanText(c));
  const parentHeaders =
    headerIdx > 0 ? (bestRows[headerIdx - 1] ?? []).map((c) => cleanText(c)) : [];

  const combinedHeaders = rawHeaders.map((h, idx) => {
    const pRaw = (parentHeaders[idx] ?? '').replace(/[_]+/g, ' ').trim();
    const p = /^\d+$/.test(pRaw) ? '' : pRaw; // Ignore column numbering rows (1, 2, 3...)
    const hClean = h.replace(/[_]+/g, ' ').trim();
    const hl = hClean.toLowerCase();
    const pl = p.toLowerCase();
    if (!hClean && p) return pl;
    if (p && !hl.includes(pl) && /^(epf|pf|esic|esi|excel|attendance)/i.test(pl)) {
      return `${pl} ${hl}`.trim();
    }
    return hl;
  });

  const findCol = (matchers: RegExp[], exclude?: RegExp[]): number => {
    for (const rx of matchers) {
      const idx = combinedHeaders.findIndex((h) => {
        if (!h) return false;
        if (exclude && exclude.some((ex) => ex.test(h))) return false;
        return rx.test(h);
      });
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameCol = findCol(
    [
      /^(names?|employee\s*names?|emp\.?\s*names?|member\s*names?|worker\s*names?|staff\s*names?|ip\s*names?|full\s*names?)$/,
      /\b(employee\s*names?|emp\.?\s*names?|member\s*names?|worker\s*names?|staff\s*names?|ip\s*names?|full\s*names?|names?\s*of\s*emp)\b/,
      /\bnames?\b/,
    ],
    [/father|husband|company|branch|bank|department|dept|sheet|dpt/]
  );

  const empCodeCol = findCol([
    /\b(emp\.?\s*code|employee\s*code|emp\.?\s*id|employee\s*id|emp\.?\s*no|staff\s*id|worker\s*id)\b/,
    /^(code|emp|id)$/,
  ]);

  let deptCol = findCol([/\b(department|dept|division|designation|unit|branch)\b/]);

  let uanCol = findCol([/\buan\b/, /universal\s*account/]);

  let ipNumberCol = findCol(
    [/\b(ip\s*no|ip\s*number|ip\s*code|ip\s*id|esic\s*no|esic\s*number|esi\s*no|esi\s*number|insurance\s*no|esic\s*id)\b/],
    [/contrib|amt|amount|ded|share|salary|wages|0\.75|3\.25/]
  );

  const attCol = findCol([
    /\b(paid\s*days|attendance\s*days|present\s*days|worked\s*days|att\.?\s*days|payable\s*days|attendance|present)\b/,
    /^days$/,
  ]);

  const workingDaysCol = findCol([
    /\b(working\s*days|total\s*days|month\s*days|std\.?\s*days|calendar\s*days)\b/,
  ]);

  const excelEECol = findCol(
    [
      /\b(pf\s*12\s*%?|epf\s*12\s*%?|excel\s*ee|epf\s*ee|pf\s*ee|ee\s*share|ee\s*contrib\w*)\b/,
      /\b(epf\s*contrib\w*|pf\s*contrib\w*|epf\s*amt|pf\s*amt|epf\s*amount|pf\s*amount|epf\s*employee|pf\s*employee|employee\s*pf|employee\s*epf|pf\s*ded\w*|epf\s*ded\w*|emp\.?\s*pf)\b/,
      /^(ee|epf|pf|p\.?f\.?)$/,
      /\b(epf|pf|ee)\b/,
    ],
    [/13\s*%|er\b|employer|eps|edli|wages|uan|number|no\b|calc|calculation|for pf/]
  );

  let excelIPCol = findCol(
    [
      /\b(esic\s*0?\.?75\s*%?|esi\s*0?\.?75\s*%?|excel\s*ip|esic\s*ip|esi\s*ip|ip\s*share|ip\s*contrib\w*)\b/,
      /\b(esic\s*share|esi\s*share|esic\s*contrib\w*|esi\s*contrib\w*|esic\s*employee|esi\s*employee|employee\s*esic|esic\s*ded\w*|esi\s*ded\w*|emp\.?\s*esi|ip\s*amt|ip\s*amount|esic\s*amt|esic\s*amount|esi\s*amt|esi\s*amount)\b/,
      /^(esic|esi|e\.?s\.?i\.?c\.?|ip\s*cont)$/,
      /\b(esic|esi)\b/,
    ],
    [/3\.25\s*%|no\b|number|code|id\b|employer|er\b|wages/]
  );

  let grossCol = findCol(
    [/\b(total\s*gross|gross\s*wages|gross\s*salary|gross\s*pay|total\s*wages|earned\s*wages|epf\s*wages|gross)\b/],
    [/deduction|contrib|share|ee|er|ip/]
  );

  // Fallback for sheets like Salarysheet 2 where earned gross column is simply "Total" right before Bonus / PF 12%
  if (grossCol === -1) {
    const searchEnd = excelEECol !== -1 ? excelEECol : combinedHeaders.length;
    for (let c = searchEnd - 1; c >= 0; c--) {
      if (/^(total|total\s*amt|salary|wages)$/.test(combinedHeaders[c])) {
        grossCol = c;
        break;
      }
    }
  }

  // Disambiguate generic "ip" column
  if (excelIPCol === -1 || ipNumberCol === -1) {
    for (let c = 0; c < combinedHeaders.length; c++) {
      if (c === excelIPCol || c === ipNumberCol) continue;
      if (/^ip(\s*\(.*\))?$/.test(combinedHeaders[c])) {
        let largeDigits = 0;
        let smallAmounts = 0;
        for (let r = headerIdx + 1; r < Math.min(bestRows.length, headerIdx + 20); r++) {
          const val = bestRows[r]?.[c];
          const num = parseNullableNumber(val);
          if (num !== null) {
            if (num >= 10000000) largeDigits++;
            else smallAmounts++;
          }
        }
        if (largeDigits > smallAmounts && ipNumberCol === -1) {
          ipNumberCol = c;
        } else if (excelIPCol === -1) {
          excelIPCol = c;
        }
      }
    }
  }

  // Data-driven inference for unlabeled UAN, ESIC IP, or Department columns
  const maxCols = Math.max(
    combinedHeaders.length,
    ...bestRows.slice(headerIdx + 1, headerIdx + 15).map((r) => (r ? r.length : 0))
  );
  const usedCols = new Set(
    [nameCol, empCodeCol, deptCol, uanCol, ipNumberCol, attCol, workingDaysCol, grossCol, excelEECol, excelIPCol].filter(
      (c) => c !== -1
    )
  );

  for (let c = 0; c < maxCols; c++) {
    if (usedCols.has(c)) continue;
    let uanHits = 0;
    let ipHits = 0;
    let textHits = 0;
    let numericHits = 0;

    for (let r = headerIdx + 1; r < Math.min(bestRows.length, headerIdx + 25); r++) {
      const row = bestRows[r];
      if (!row || (nameCol !== -1 && isSummaryOrBlankName(cleanText(row[nameCol])))) continue;
      const cell = row[c];
      const txt = cleanText(cell);
      if (!txt) continue;

      const uanCandidate = normalizeIdDigits(cell, 12);
      if (uanCandidate && uanCandidate.length === 12) {
        uanHits++;
      } else {
        const ipCandidate = normalizeIdDigits(cell, 10);
        if (ipCandidate && ipCandidate.length === 10) {
          ipHits++;
        } else if (/^-?\d+(\.\d+)?$/.test(txt)) {
          numericHits++;
        } else if (/^[a-zA-Z][a-zA-Z\s.&/-]{1,30}$/.test(txt)) {
          textHits++;
        }
      }
    }

    if (uanCol === -1 && uanHits >= 1 && ipHits === 0) {
      uanCol = c;
      usedCols.add(c);
    } else if (ipNumberCol === -1 && ipHits >= 1 && uanHits === 0) {
      ipNumberCol = c;
      usedCols.add(c);
    } else if (
      deptCol === -1 &&
      c <= 6 &&
      !combinedHeaders[c] &&
      textHits >= 2 &&
      numericHits === 0
    ) {
      deptCol = c;
      usedCols.add(c);
    }
  }

  if (nameCol === -1) {
    warnings.push(
      'Could not find an "Employee Name" column automatically. Ensure the Excel header row includes Employee Name or Names.'
    );
    return { rows: [], warnings };
  }

  const parsed: ExcelEmployeeRow[] = [];
  for (let r = headerIdx + 1; r < bestRows.length; r++) {
    const row = bestRows[r];
    if (!row || row.every((cell) => cleanText(cell) === '')) continue;

    const rawName = cleanText(row[nameCol]);
    if (isSummaryOrBlankName(rawName)) continue;

    const rawCode = empCodeCol !== -1 ? cleanText(row[empCodeCol]) : '';
    const empCode = rawCode && !/^\d+$/.test(rawCode) ? rawCode : `EMP-${rawCode || String(parsed.length + 1001)}`;
    const department =
      deptCol !== -1 && cleanText(row[deptCol]) ? cleanText(row[deptCol]) : 'General';
    const uan = uanCol !== -1 ? normalizeIdDigits(row[uanCol], 12) : null;
    const ipNumber = ipNumberCol !== -1 ? normalizeIdDigits(row[ipNumberCol], 10) : null;

    let attVal = attCol !== -1 ? parseNullableNumber(row[attCol]) : null;
    let workVal = workingDaysCol !== -1 ? parseNullableNumber(row[workingDaysCol]) : null;
    if (attVal === null && attCol !== -1) {
      const attFrac = cleanText(row[attCol]).match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
      if (attFrac) {
        attVal = Math.round(Number(attFrac[1]));
        if (workVal === null) workVal = Math.round(Number(attFrac[2]));
      }
    }
    const workingDays = workVal && workVal > 0 ? workVal : 26;
    const attendanceDays = attVal !== null ? attVal : workingDays;

    const grossVal = grossCol !== -1 ? parseNullableNumber(row[grossCol]) : null;
    const excelEE = excelEECol !== -1 ? parseNullableNumber(row[excelEECol]) : null;
    const excelIP = excelIPCol !== -1 ? parseNullableNumber(row[excelIPCol]) : null;

    const grossWages =
      grossVal !== null ? grossVal : excelEE !== null ? Math.round(excelEE / 0.12) : 0;

    parsed.push({
      rowIndex: r + 1,
      empCode,
      name: rawName,
      department,
      uan,
      ipNumber,
      attendanceDays,
      workingDays,
      grossWages,
      excelEE,
      excelIP,
    });
  }

  if (parsed.length === 0) {
    warnings.push('No employee data rows were detected below the Excel header row.');
  } else {
    if (excelEECol === -1) {
      warnings.push('No Excel EE (PF 12% / EPF) column detected; EE cells will appear Blank.');
    }
    if (excelIPCol === -1) {
      warnings.push('No Excel IP (ESIC 0.75% / IP) column detected; IP cells will appear Blank.');
    }
  }

  return { rows: parsed, warnings };
}

/**
 * Extracts visually oriented text tokens (x left-to-right, y top-to-bottom)
 * per page using viewport transforms, automatically handling 90°/180°/270° rotated PDFs.
 */
async function extractPdfPageTokens(buffer: Buffer): Promise<PdfPageTokens[]> {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    verbosity: 0,
  });

  const pdf = await loadingTask.promise;
  const pages: PdfPageTokens[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const tokens: PdfTextToken[] = [];
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string') {
        const str = item.str.replace(/\s+/g, ' ').trim();
        if (!str) continue;
        const tr = pdfjsLib.Util.transform(
          viewport.transform,
          item.transform as number[]
        );
        tokens.push({
          x: tr[4] ?? 0,
          y: tr[5] ?? 0,
          str,
        });
      }
    }

    tokens.sort((a, b) => a.y - b.y || a.x - b.x);
    pages.push({
      page: pageNum,
      width: viewport.width,
      height: viewport.height,
      tokens,
    });
  }

  await loadingTask.destroy();
  return pages;
}

function parseNumericToken(str: string): number | null {
  const cleaned = str.replace(/[*#₹,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function expandTokenAtoms(tokens: PdfTextToken[]): PdfTextToken[] {
  const atoms: PdfTextToken[] = [];
  for (const tok of tokens) {
    const parts = tok.str.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      atoms.push(tok);
    } else {
      let offset = 0;
      for (const p of parts) {
        atoms.push({ x: tok.x + offset * 4.5, y: tok.y, str: p });
        offset += p.length + 1;
      }
    }
  }
  return atoms;
}

function stripSalutation(name: string): string {
  return name
    .replace(/\b(mr|mrs|ms|miss|shri|smt|kumari|dr)\.?\s+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses an EPF ECR Challan PDF into member rows (UAN, Name, EPF Wages, EE Contribution).
 * Handles rotated landscape EPFO ECR layouts, dual ECR/UAN Repository name columns,
 * multi-line wrapped names, page-break surname overflow, and Combined Challan detection.
 */
export async function parseEpfEcrPdf(
  buffer: Buffer
): Promise<{ rows: EpfEcrRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  const pages = await extractPdfPageTokens(buffer);
  if (pages.length === 0) {
    return {
      rows: [],
      warnings: ['No readable text found in EPF ECR PDF (scanned image PDFs require OCR).'],
    };
  }

  // Detect layout column coordinates across document
  let isStandardEpfoEcr = false;
  let uanColX: number | null = null;
  let ecrColX: number | null = null;
  let repoColX: number | null = null;
  let grossColX: number | null = null;
  let epfWagesColX: number | null = null;
  let eeColX: number | null = null;

  for (const pg of pages) {
    const hasMemberHeader = pg.tokens.some((t) => /member\s*details/i.test(t.str)) ||
      (pg.tokens.some((t) => /^uan$/i.test(t.str)) &&
        pg.tokens.some((t) => /^repository$/i.test(t.str) || /^edli$/i.test(t.str)));

    if (hasMemberHeader) {
      isStandardEpfoEcr = true;
      for (const t of pg.tokens) {
        if (t.y > 140) continue;
        const tl = t.str.toLowerCase();
        if (tl === 'uan' && t.x < 120 && uanColX === null) uanColX = t.x;
        else if (tl === 'ecr' && t.x > 100 && t.x < 200 && ecrColX === null) ecrColX = t.x;
        else if (tl === 'repository' && t.x > 140 && t.x < 230 && repoColX === null) repoColX = t.x;
        else if (tl === 'gross' && t.x > 200 && t.x < 280 && grossColX === null) grossColX = t.x;
        else if (tl === 'epf' && t.x > 240 && t.x < 330 && epfWagesColX === null) epfWagesColX = t.x;
        else if (tl === 'ee' && t.x > 370 && t.x < 460 && eeColX === null) eeColX = t.x;
      }
      if (eeColX !== null) break;
    }

    // Also support custom/simple single-row EPF PDFs
    if (!isStandardEpfoEcr) {
      for (const t of pg.tokens) {
        const tl = t.str.toLowerCase();
        if (/^(ee|ee\s*share|epf\s*ee|ee\s*cont|employee\s*share|ee\s*contribution)$/.test(tl)) {
          eeColX = t.x;
        } else if (/^(epf\s*wages|epf|wages)$/.test(tl) && epfWagesColX === null) {
          epfWagesColX = t.x;
        }
      }
    }
  }

  const parsed: EpfEcrRow[] = [];

  if (isStandardEpfoEcr) {
    const uanMinX = uanColX !== null ? uanColX - 35 : 40;
    const uanMaxX = ecrColX !== null ? Math.min(ecrColX - 24, (uanColX ?? 75) + 34) : 108;
    const ecrNameMinX = uanMaxX;
    const ecrNameMaxX = repoColX !== null ? repoColX - 8 : 168;
    const repoNameMinX = ecrNameMaxX;
    const repoNameMaxX = grossColX !== null ? grossColX - 10 : 225;
    const eeTargetX = eeColX ?? 408;
    const epfWagesTargetX = epfWagesColX ?? 276;

    for (const pg of pages) {
      // Determine vertical bounds of the table on this page
      let headerBottomY = 45;
      for (const t of pg.tokens) {
        if (t.y < 140 && /^(days|share|ecr|repository|gross|edli)$/i.test(t.str)) {
          headerBottomY = Math.max(headerBottomY, t.y + 3);
        }
      }

      let footerTopY = pg.height - 25;
      for (const t of pg.tokens) {
        if (
          t.y > 160 &&
          (/^(reason\s*code|reason\s*name|abry\s*benefit)/i.test(t.str) ||
            /^EC\d{5}$/i.test(t.str) ||
            /^GK\d{5}$/i.test(t.str) ||
            /^\d+\s*\/\s*\d+$/.test(t.str) ||
            /APR-\d{4}|MAY-\d{4}|\/\s*\d{2}:\d{2}/.test(t.str))
        ) {
          if (t.y > 180) {
            footerTopY = Math.min(footerTopY, t.y - 6);
          }
        }
      }

      const anchors = pg.tokens
        .filter(
          (t) =>
            t.y >= headerBottomY &&
            t.y <= footerTopY &&
            t.x >= uanMinX &&
            t.x <= uanMaxX &&
            /^[*#]?\d{12}$/.test(t.str)
        )
        .sort((a, b) => a.y - b.y);

      if (anchors.length === 0) continue;

      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const uan = anchor.str.replace(/\D/g, '');
        const topY =
          i === 0
            ? Math.max(headerBottomY, anchor.y - 16)
            : Math.max(anchor.y - 14, (anchors[i - 1].y + anchor.y) / 2);
        const bottomY =
          i === anchors.length - 1
            ? Math.min(footerTopY, anchor.y + 15)
            : Math.min(anchor.y + 14, (anchor.y + anchors[i + 1].y) / 2);

        // Handle rare page-break surname overflow above row 0 on this page
        if (i === 0 && parsed.length > 0) {
          const overflowToks = pg.tokens.filter(
            (t) =>
              t.y >= headerBottomY &&
              t.y < topY &&
              t.x >= ecrNameMinX &&
              t.x < ecrNameMaxX &&
              /[a-zA-Z]{2,}/.test(t.str) &&
              !/^(mr|mrs|ms|miss|shri|smt)\.?$/i.test(t.str)
          );
          if (overflowToks.length > 0) {
            const extra = overflowToks.map((t) => t.str).join(' ').trim();
            const prev = parsed[parsed.length - 1];
            if (extra && !prev.name.toLowerCase().includes(extra.toLowerCase())) {
              prev.name = `${prev.name} ${extra}`.replace(/\s+/g, ' ').trim();
            }
          }
        }

        const bandTokens = pg.tokens.filter((t) => t.y >= topY && t.y <= bottomY);

        // Extract Name from "Name as per ECR" column cleanly; ignore stray single-char top wrap before Mr./Mrs./Ms.
        let ecrNameToks = bandTokens
          .filter((t) => t.x >= ecrNameMinX && t.x < ecrNameMaxX)
          .sort((a, b) => a.y - b.y || a.x - b.x);

        const salIdx = ecrNameToks.findIndex((t) => /^(mr|mrs|ms|miss|shri|smt)\b\.?/i.test(t.str));
        if (salIdx > 0) {
          ecrNameToks = ecrNameToks.slice(salIdx);
        }

        let memberName = stripSalutation(ecrNameToks.map((t) => t.str).join(' '));
        if (!memberName) {
          const repoNameToks = bandTokens
            .filter((t) => t.x >= repoNameMinX && t.x < repoNameMaxX)
            .sort((a, b) => a.y - b.y || a.x - b.x);
          memberName = stripSalutation(repoNameToks.map((t) => t.str).join(' '));
        }

        if (!memberName || isSummaryOrBlankName(memberName)) continue;

        const numericNearRow = bandTokens
          .map((t) => ({ x: t.x, y: t.y, val: parseNumericToken(t.str) }))
          .filter((t): t is { x: number; y: number; val: number } => t.val !== null);

        const eeTok = numericNearRow
          .filter((t) => Math.abs(t.x - eeTargetX) <= 35)
          .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y) || Math.abs(a.x - eeTargetX) - Math.abs(b.x - eeTargetX))[0];

        const wagesTok = numericNearRow
          .filter((t) => Math.abs(t.x - epfWagesTargetX) <= 35)
          .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y) || Math.abs(a.x - epfWagesTargetX) - Math.abs(b.x - epfWagesTargetX))[0];

        parsed.push({
          lineNumber: parsed.length + 1,
          uan,
          name: memberName,
          epfWages: wagesTok ? wagesTok.val : null,
          epfEE: eeTok ? eeTok.val : null,
        });
      }
    }
  } else {
    // Generic / custom EPF PDF fallback (row-clustered in visual viewport coordinates)
    const skipLineRx =
      /\b(grand\s*total|establishment|trrn|challan|wage\s*month|total\s*members|total\s*epf|summary|page\s*\d+|generated\s*on)\b/i;

    for (const pg of pages) {
      const yRows: Array<{ y: number; tokens: PdfTextToken[] }> = [];
      for (const tok of pg.tokens) {
        const last = yRows[yRows.length - 1];
        if (last && Math.abs(last.y - tok.y) <= 4) {
          last.tokens.push(tok);
        } else {
          yRows.push({ y: tok.y, tokens: [tok] });
        }
      }

      for (const row of yRows) {
        row.tokens.sort((a, b) => a.x - b.x);
        const text = row.tokens.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim();
        if (!text || skipLineRx.test(text)) continue;

        const atoms = expandTokenAtoms(row.tokens);
        let uan: string | null = null;
        let uanTokenIdx = -1;
        for (let i = 0; i < atoms.length; i++) {
          const m = atoms[i].str.match(/^[*#]?(\d{12})$/);
          if (m) {
            uan = m[1];
            uanTokenIdx = i;
            break;
          }
        }
        if (!uan) {
          const mText = text.match(/\b(\d{12})\b/);
          if (mText) uan = mText[1];
        }

        const nameTokens: string[] = [];
        const numericTokens: Array<{ x: number; val: number }> = [];
        for (let i = 0; i < atoms.length; i++) {
          if (i === uanTokenIdx) continue;
          const cleanTok = atoms[i].str.trim();
          if (!cleanTok || (uan && cleanTok.includes(uan))) continue;
          const num = parseNumericToken(cleanTok);
          if (num !== null) {
            if (uanTokenIdx !== -1 && i < uanTokenIdx && num < 5000) continue;
            if (uanTokenIdx === -1 && i === 0 && num < 5000) continue;
            numericTokens.push({ x: atoms[i].x, val: num });
          } else if (/[a-zA-Z]/.test(cleanTok) && !/^(mr|mrs|ms|nil|na)$/i.test(cleanTok)) {
            nameTokens.push(cleanTok);
          }
        }

        const memberName = stripSalutation(nameTokens.join(' '));
        if (!memberName || isSummaryOrBlankName(memberName) || numericTokens.length === 0) continue;
        if (!uan && eeColX === null) continue;

        let epfEE: number | null = null;
        let epfWages: number | null = null;

        if (eeColX !== null) {
          const closest = [...numericTokens].sort(
            (a, b) => Math.abs(a.x - eeColX!) - Math.abs(b.x - eeColX!)
          )[0];
          if (closest && Math.abs(closest.x - eeColX) <= 65) epfEE = closest.val;
        }
        if (epfWagesColX !== null) {
          const closestWage = [...numericTokens].sort(
            (a, b) => Math.abs(a.x - epfWagesColX!) - Math.abs(b.x - epfWagesColX!)
          )[0];
          if (closestWage && Math.abs(closestWage.x - epfWagesColX) <= 65) epfWages = closestWage.val;
        }
        if (epfEE === null) {
          const vals = numericTokens.map((n) => n.val);
          epfEE = vals.length >= 7 ? vals[4] : vals[vals.length - 1];
        }

        parsed.push({
          lineNumber: parsed.length + 1,
          uan,
          name: memberName,
          epfWages,
          epfEE,
        });
      }
    }
  }

  if (parsed.length === 0) {
    const allText = pages.map((p) => p.tokens.map((t) => t.str).join(' ')).join(' ');
    if (/combined\s*challan/i.test(allText)) {
      warnings.push(
        'Uploaded PDF is an EPF Combined Challan summary (totals only, no individual UAN rows). Please upload the member-wise EPF ECR PDF.'
      );
    } else {
      warnings.push(
        'No EPF ECR member rows (12-digit UAN + EE contribution) could be extracted from the PDF.'
      );
    }
  }

  return { rows: parsed, warnings };
}

/**
 * Parses an ESIC IP Contribution PDF into member rows (IP Number, IP Name, Paid Days, Wages, IP Contribution).
 * Uses column-bounded vertical anchor banding so wrapped IP Names and Reason codes ("No Work",
 * "Out of Coverage", "Doesnt Belong To This") stay strictly isolated.
 */
export async function parseEsicIpPdf(
  buffer: Buffer
): Promise<{ rows: EsicIpRow[]; warnings: string[] }> {
  const warnings: string[] = [];
  const pages = await extractPdfPageTokens(buffer);
  if (pages.length === 0) {
    return {
      rows: [],
      warnings: ['No readable text found in ESIC IP PDF (scanned image PDFs require OCR).'],
    };
  }

  let ipNumHeaderX: number | null = null;
  let ipNameHeaderX: number | null = null;
  let daysHeaderX: number | null = null;
  let wagesHeaderX: number | null = null;
  let ipContribHeaderX: number | null = null;
  let reasonHeaderX: number | null = null;

  for (const pg of pages) {
    const hasTableHeader = pg.tokens.some((t) => /ip\s*number/i.test(t.str)) &&
      pg.tokens.some((t) => /ip\s*name|contribution/i.test(t.str));
    if (hasTableHeader) {
      for (const t of pg.tokens) {
        const tl = t.str.toLowerCase();
        if (/^ip\s*number$/.test(tl) && ipNumHeaderX === null) ipNumHeaderX = t.x;
        else if (/^ip\s*name$/.test(tl) && ipNameHeaderX === null) ipNameHeaderX = t.x;
        else if (/^days$|^no\.?\s*of/.test(tl) && t.x > 300 && daysHeaderX === null) daysHeaderX = t.x;
        else if (/^wages$|^total\s*wages$/.test(tl) && t.x > 380 && wagesHeaderX === null) wagesHeaderX = t.x;
        else if (/^contribution$|^ip\s*contrib/.test(tl) && t.x > 450 && ipContribHeaderX === null) ipContribHeaderX = t.x;
        else if (/^reason$/.test(tl) && t.x > 520 && reasonHeaderX === null) reasonHeaderX = t.x;
      }
      if (ipNumHeaderX !== null && ipContribHeaderX !== null) break;
    }

    // Custom ESIC PDF fallback header check
    for (const t of pg.tokens) {
      const tl = t.str.toLowerCase();
      if (/^(ip\s*contrib|ip\s*contribution|employee\s*contrib|ip\s*share|esic\s*ip|esi\s*amt|contribution|amount|ip\s*amt)$/.test(tl)) {
        ipContribHeaderX = ipContribHeaderX ?? t.x;
      } else if (/^(total\s*wages|monthly\s*wages|wages|gross)$/.test(tl)) {
        wagesHeaderX = wagesHeaderX ?? t.x;
      }
    }
  }

  const parsed: EsicIpRow[] = [];

  if (ipNumHeaderX !== null && ipNameHeaderX !== null) {
    const ipMinX = ipNumHeaderX - 30;
    const ipMaxX = ipNameHeaderX - 12;
    const nameMinX = ipNameHeaderX - 10;
    const nameMaxX = (daysHeaderX ?? 360) - 8;
    const daysX = daysHeaderX ?? 360;
    const wagesX = wagesHeaderX ?? 420;
    const contribX = ipContribHeaderX ?? 485;
    const contribMaxX = (reasonHeaderX ?? 550) - 8;

    for (const pg of pages) {
      let headerBottomY = 40;
      for (const t of pg.tokens) {
        if (t.y < 230 && /^(sno\.?|ip\s*number|days|wages|contribution|reason)$/i.test(t.str)) {
          headerBottomY = Math.max(headerBottomY, t.y + 3);
        }
      }

      let footerTopY = pg.height - 25;
      for (const t of pg.tokens) {
        if (t.y > 450 && (/^page\s+\d+\s+of\s+\d+/i.test(t.str) || /^printed\s*on:/i.test(t.str))) {
          footerTopY = Math.min(footerTopY, t.y - 12);
        }
      }

      const anchors = pg.tokens
        .filter(
          (t) =>
            t.y >= headerBottomY &&
            t.y <= footerTopY &&
            t.x >= ipMinX &&
            t.x <= ipMaxX &&
            /^\d{10}$/.test(t.str)
        )
        .sort((a, b) => a.y - b.y);

      for (let i = 0; i < anchors.length; i++) {
        const anchor = anchors[i];
        const topY =
          i === 0
            ? Math.max(headerBottomY, anchor.y - 15)
            : Math.max(anchor.y - 14, (anchors[i - 1].y + anchor.y) / 2);
        const bottomY =
          i === anchors.length - 1
            ? Math.min(footerTopY, anchor.y + 15)
            : Math.min(anchor.y + 14, (anchor.y + anchors[i + 1].y) / 2);

        const bandTokens = pg.tokens.filter((t) => t.y >= topY && t.y <= bottomY);

        const nameToks = bandTokens
          .filter((t) => t.x >= nameMinX && t.x < nameMaxX)
          .sort((a, b) => a.y - b.y || a.x - b.x);
        const ipName = nameToks.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim();
        if (!ipName || isSummaryOrBlankName(ipName)) continue;

        const daysTok = bandTokens
          .filter((t) => t.x >= nameMaxX && t.x < wagesX - 15)
          .map((t) => ({ ...t, val: parseNumericToken(t.str) }))
          .filter((t) => t.val !== null)
          .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))[0];

        const wagesTok = bandTokens
          .filter((t) => t.x >= wagesX - 25 && t.x < contribX - 15)
          .map((t) => ({ ...t, val: parseNumericToken(t.str) }))
          .filter((t) => t.val !== null)
          .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))[0];

        const contribTok = bandTokens
          .filter((t) => t.x >= contribX - 20 && t.x < contribMaxX)
          .map((t) => ({ ...t, val: parseNumericToken(t.str) }))
          .filter((t) => t.val !== null)
          .sort((a, b) => Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y))[0];

        const reasonText = bandTokens
          .filter(
            (t) =>
              t.x >= (reasonHeaderX ?? 545) - 10 &&
              t.x < pg.width &&
              Math.abs(t.y - anchor.y) <= 14
          )
          .sort((a, b) => a.y - b.y || a.x - b.x)
          .map((t) => t.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        const normalizedReason = reasonText.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
        const recognizedReason = [
          'out of coverage',
          'doesnt belong to this',
          'does not belong to this',
          'left service',
          'no work',
          'on leave',
        ].find((reason) => normalizedReason.includes(reason)) ?? null;

        parsed.push({
          lineNumber: parsed.length + 1,
          ipNumber: anchor.str,
          name: ipName,
          paidDays: daysTok ? daysTok.val : null,
          wages: wagesTok ? wagesTok.val : null,
          esicIP: contribTok ? contribTok.val : null,
          reason: recognizedReason,
        });
      }
    }
  } else {
    // Custom ESIC PDF fallback
    const skipLineRx =
      /\b(grand\s*total|employer\s*code|challan|contribution\s*period|total\s*ip|summary|page\s*\d+|generated\s*on)\b/i;

    for (const pg of pages) {
      const yRows: Array<{ y: number; tokens: PdfTextToken[] }> = [];
      for (const tok of pg.tokens) {
        const last = yRows[yRows.length - 1];
        if (last && Math.abs(last.y - tok.y) <= 4) {
          last.tokens.push(tok);
        } else {
          yRows.push({ y: tok.y, tokens: [tok] });
        }
      }

      for (const row of yRows) {
        row.tokens.sort((a, b) => a.x - b.x);
        const text = row.tokens.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim();
        if (!text || skipLineRx.test(text)) continue;

        const atoms = expandTokenAtoms(row.tokens);
        let ipNumber: string | null = null;
        let ipTokenIdx = -1;
        for (let i = 0; i < atoms.length; i++) {
          const m = atoms[i].str.match(/^\D*(\d{10})\D*$/);
          if (m) {
            ipNumber = m[1];
            ipTokenIdx = i;
            break;
          }
        }
        if (!ipNumber) {
          const mText = text.match(/\b(\d{10})\b/);
          if (mText) ipNumber = mText[1];
        }

        const nameTokens: string[] = [];
        const numericTokens: Array<{ x: number; val: number }> = [];
        for (let i = 0; i < atoms.length; i++) {
          if (i === ipTokenIdx) continue;
          const cleanTok = atoms[i].str.trim();
          if (!cleanTok || (ipNumber && cleanTok.includes(ipNumber))) continue;
          const num = parseNumericToken(cleanTok);
          if (num !== null) {
            if (ipTokenIdx !== -1 && i < ipTokenIdx && num < 5000) continue;
            if (ipTokenIdx === -1 && i === 0 && num < 5000) continue;
            numericTokens.push({ x: atoms[i].x, val: num });
          } else if (/[a-zA-Z]/.test(cleanTok) && !/^(mr|mrs|ms|nil|na|-)$/i.test(cleanTok)) {
            nameTokens.push(cleanTok);
          }
        }

        const ipName = nameTokens.join(' ').replace(/\s+/g, ' ').trim();
        if (!ipName || isSummaryOrBlankName(ipName) || numericTokens.length === 0) continue;
        if (!ipNumber && ipContribHeaderX === null) continue;

        let esicIP: number | null = null;
        let wages: number | null = null;
        let paidDays: number | null = null;

        if (ipContribHeaderX !== null) {
          const closest = [...numericTokens].sort(
            (a, b) => Math.abs(a.x - ipContribHeaderX!) - Math.abs(b.x - ipContribHeaderX!)
          )[0];
          if (closest && Math.abs(closest.x - ipContribHeaderX) <= 65) esicIP = closest.val;
        }
        if (wagesHeaderX !== null) {
          const closestWage = [...numericTokens].sort(
            (a, b) => Math.abs(a.x - wagesHeaderX!) - Math.abs(b.x - wagesHeaderX!)
          )[0];
          if (closestWage && Math.abs(closestWage.x - wagesHeaderX) <= 65) wages = closestWage.val;
        }
        if (esicIP === null) {
          const vals = numericTokens.map((n) => n.val);
          if (vals.length >= 3) {
            paidDays = vals[0] <= 31 ? vals[0] : null;
            wages = wages ?? vals[1];
            esicIP = vals[2];
          } else {
            esicIP = vals[vals.length - 1];
          }
        }

        parsed.push({
          lineNumber: parsed.length + 1,
          ipNumber,
          name: ipName,
          paidDays,
          wages,
          esicIP,
        });
      }
    }
  }

  if (parsed.length === 0) {
    warnings.push(
      'No ESIC IP member rows (10-digit IP number + contribution) could be extracted from the PDF.'
    );
  }

  return { rows: parsed, warnings };
}

/**
 * Classifies a single EmployeeAuditRecord against current AuditSettings
 * (differenceThreshold, fuzzyNameThreshold, strictUanMatching, flagBlankIpAsReview).
 */
export function classifyRecordWithSettings(
  rec: EmployeeAuditRecord,
  settings: AuditSettings,
  flags: { hasEpf: boolean; hasEsic: boolean }
): EmployeeAuditRecord {
  if (
    rec.flagReason.startsWith('Manually approved match') &&
    rec.matchConfidence === 100
  ) {
    const eeDiff =
      rec.excelEE !== null && rec.epfEE !== null ? Math.abs(rec.excelEE - rec.epfEE) : 0;
    const ipDiff =
      rec.excelIP !== null && rec.esicIP !== null ? Math.abs(rec.excelIP - rec.esicIP) : 0;
    if (eeDiff <= settings.differenceThreshold && ipDiff <= settings.differenceThreshold) {
      return { ...rec, status: 'Matched' };
    }
  }

  const eeDiff =
    rec.excelEE !== null && rec.epfEE !== null ? Math.abs(rec.excelEE - rec.epfEE) : null;
  const ipDiff =
    rec.excelIP !== null && rec.esicIP !== null ? Math.abs(rec.excelIP - rec.esicIP) : null;

  let status: VerificationStatus = 'Matched';
  let flagReason = rec.flagReason;
  const normalizedEsicReason = (rec.esicReason ?? '').toLowerCase();
  const esicCoverageNeedsReview =
    /out of coverage|doesnt belong|does not belong/.test(normalizedEsicReason) ||
    ((/no work|left service|on leave/.test(normalizedEsicReason)) && (rec.excelIP ?? 0) > 0);

  // 1. Blank IP handling (never coerce blank to 0; only flag when PDF reports positive IP contribution)
  if (
    settings.flagBlankIpAsReview &&
    rec.excelIP === null &&
    rec.esicIP !== null &&
    rec.esicIP > 0
  ) {
    status = 'Blank IP';
    flagReason = `Excel IP cell is blank while ESIC IP PDF shows ₹${rec.esicIP.toLocaleString('en-IN')}. Blank values are flagged explicitly.`;
  }
  // ESIC coverage reasons need review instead of being treated as a numeric match.
  else if (esicCoverageNeedsReview) {
    status = 'Needs Review';
    flagReason = `ESIC statement reason: ${rec.esicReason}. Excel expected ₹${(rec.excelIP ?? 0).toLocaleString('en-IN')}; PDF records ₹${(rec.esicIP ?? 0).toLocaleString('en-IN')}. Review the coverage status.`;
  }
  // 2. Fuzzy / uncertain identity match
  else if (
    rec.matchConfidence < 100 &&
    (rec.matchConfidence < settings.fuzzyNameThreshold ||
      (settings.strictUanMatching && (!rec.uan || !rec.ipNumber)))
  ) {
    status = 'Needs Review';
    if (
      !rec.flagReason ||
      rec.flagReason.startsWith('All available') ||
      rec.flagReason.startsWith('Matched within')
    ) {
      flagReason = `Uncertain identity / unmapped ID (${rec.matchConfidence}% name similarity); queued for manual verification.`;
    }
  }
  // 3. Missing from uploaded EPF or ESIC PDFs
  else if (
    (flags.hasEpf && rec.excelEE !== null && rec.excelEE > 0 && rec.epfEE === null) ||
    (flags.hasEsic && rec.excelIP !== null && rec.excelIP > 0 && rec.esicIP === null) ||
    (rec.excelEE === null && rec.excelIP === null && (rec.epfEE !== null || rec.esicIP !== null))
  ) {
    status = 'Missing Record';
    if (rec.excelEE === null && rec.excelIP === null) {
      flagReason =
        'Present in statutory PDF challan, but missing from Attendance / Salary Excel register.';
    } else if (flags.hasEpf && rec.excelEE !== null && rec.excelEE > 0 && rec.epfEE === null) {
      flagReason = `Employee present in Excel (₹${rec.excelEE.toLocaleString('en-IN')} EE), but missing from uploaded EPF ECR PDF.`;
    } else {
      flagReason = `Employee present in Excel (₹${(rec.excelIP ?? 0).toLocaleString('en-IN')} IP), but missing from uploaded ESIC IP PDF.`;
    }
  }
  // 4. Excel EE blank when EPF PDF has positive contribution
  else if (rec.excelEE === null && rec.epfEE !== null && rec.epfEE > 0) {
    status = 'Needs Review';
    flagReason = `Excel EE cell is blank while EPF ECR PDF reports ₹${rec.epfEE.toLocaleString('en-IN')}.`;
  }
  // 5. No PDFs uploaded yet — scanned from Excel only
  else if (!flags.hasEpf && !flags.hasEsic) {
    status = rec.excelIP === null && settings.flagBlankIpAsReview ? 'Blank IP' : 'Needs Review';
    flagReason =
      'Scanned from Attendance / Salary Excel. Upload EPF ECR and/or ESIC IP PDFs to verify statutory contributions.';
  }
  // 6. Numeric difference threshold check
  else if (
    (eeDiff !== null && eeDiff > settings.differenceThreshold) ||
    (ipDiff !== null && ipDiff > settings.differenceThreshold)
  ) {
    status = 'Mismatch';
    const parts: string[] = [];
    if (eeDiff !== null && eeDiff > settings.differenceThreshold) {
      parts.push(
        `EPF EE variance of ₹${eeDiff.toLocaleString('en-IN')} (Excel ₹${rec.excelEE!.toLocaleString('en-IN')} vs PDF ₹${rec.epfEE!.toLocaleString('en-IN')})`
      );
    }
    if (ipDiff !== null && ipDiff > settings.differenceThreshold) {
      parts.push(
        `ESIC IP variance of ₹${ipDiff.toLocaleString('en-IN')} (Excel ₹${rec.excelIP!.toLocaleString('en-IN')} vs PDF ₹${rec.esicIP!.toLocaleString('en-IN')})`
      );
    }
    flagReason = `${parts.join('; ')} — exceeds ₹${settings.differenceThreshold.toLocaleString('en-IN')} threshold.`;
  }
  // 7. Matched within threshold
  else {
    status = 'Matched';
    const maxVar = Math.max(eeDiff ?? 0, ipDiff ?? 0);
    flagReason =
      maxVar === 0
        ? 'All available contribution fields match with ₹0 variance.'
        : `Matched within ₹${settings.differenceThreshold.toLocaleString('en-IN')} tolerance (max variance ₹${maxVar.toLocaleString('en-IN')}).`;
  }

  return {
    ...rec,
    status,
    flagReason,
  };
}

/**
 * Performs cross-document reconciliation across parsed Excel, EPF ECR, and ESIC IP rows.
 * Uses O(1) UAN / IP lookup indices + fuzzy Indian name matching fallback.
 * When an Excel register is uploaded, keeps Total Employees scoped to the Excel roster
 * so site-level payroll sheets aren't flooded by 1,700+ multi-site PDF records.
 */
export function reconcileAuditData(params: {
  excelRows: ExcelEmployeeRow[];
  epfRows: EpfEcrRow[];
  esicRows: EsicIpRow[];
  settings: AuditSettings;
  hasExcel: boolean;
  hasEpf: boolean;
  hasEsic: boolean;
}): {
  records: EmployeeAuditRecord[];
  manualCandidates: ManualMatchCandidate[];
} {
  const { excelRows, epfRows, esicRows, settings, hasExcel, hasEpf, hasEsic } = params;

  const epfByUan = new Map<string, number>();
  epfRows.forEach((r, idx) => {
    if (r.uan && !epfByUan.has(r.uan)) epfByUan.set(r.uan, idx);
  });

  const esicByIp = new Map<string, number>();
  esicRows.forEach((r, idx) => {
    if (r.ipNumber && !esicByIp.has(r.ipNumber)) esicByIp.set(r.ipNumber, idx);
  });

  const matchedEpfIdx = new Set<number>();
  const matchedEsicIdx = new Set<number>();
  const manualCandidates: ManualMatchCandidate[] = [];
  const rawRecords: EmployeeAuditRecord[] = [];

  for (let i = 0; i < excelRows.length; i++) {
    const ex = excelRows[i];
    const recId = `scan-emp-${i + 1}`;

    // 1. Match against EPF ECR
    let epfMatch: EpfEcrRow | null = null;
    let epfConf = 100;
    let epfNote = '';

    if (hasEpf && epfRows.length > 0) {
      if (ex.uan) {
        const idx = epfByUan.get(ex.uan);
        if (idx !== undefined && !matchedEpfIdx.has(idx)) {
          epfMatch = epfRows[idx];
          matchedEpfIdx.add(idx);
          epfConf = 100;
          epfNote = `EPF ECR matched by UAN (${ex.uan}).`;
        }
      }

      if (!epfMatch) {
        let bestIdx = -1;
        let bestSim = 0;
        for (let rIdx = 0; rIdx < epfRows.length; rIdx++) {
          if (matchedEpfIdx.has(rIdx)) continue;
          const sim = computeNameSimilarity(ex.name, epfRows[rIdx].name);
          if (sim > bestSim) {
            bestSim = sim;
            bestIdx = rIdx;
          }
        }

        if (bestIdx !== -1 && bestSim >= Math.min(68, settings.fuzzyNameThreshold - 5)) {
          epfMatch = epfRows[bestIdx];
          matchedEpfIdx.add(bestIdx);
          epfConf = !ex.uan && bestSim >= 95 ? 90 : bestSim;
          const reason = !ex.uan
            ? `Excel UAN is blank; matched "${epfMatch.name}" in EPF ECR (${epfConf}% similarity).`
            : `UAN mismatch or variation; fuzzy matched "${epfMatch.name}" (${epfConf}% similarity).`;
          epfNote = reason;

          if (epfConf < 98 || (!ex.uan && settings.strictUanMatching)) {
            manualCandidates.push({
              id: `mr-epf-${i + 1}`,
              employeeRecordId: recId,
              excelName: ex.name,
              empCode: ex.empCode,
              excelUan: ex.uan,
              excelIp: ex.ipNumber,
              suggestedPdfName: epfMatch.name,
              pdfSource: 'EPF ECR PDF',
              pdfUanOrIp: epfMatch.uan ?? 'N/A',
              confidence: epfConf,
              reason,
              decision: 'Pending',
              excelAmount: ex.excelEE,
              pdfAmount: epfMatch.epfEE,
            });
          }
        }
      }
    }

    // 2. Match against ESIC IP
    let esicMatch: EsicIpRow | null = null;
    let esicConf = 100;
    let esicNote = '';

    if (hasEsic && esicRows.length > 0) {
      if (ex.ipNumber) {
        const idx = esicByIp.get(ex.ipNumber);
        if (idx !== undefined && !matchedEsicIdx.has(idx)) {
          esicMatch = esicRows[idx];
          matchedEsicIdx.add(idx);
          esicConf = 100;
          esicNote = `ESIC IP matched by IP No (${ex.ipNumber}).`;
        }
      }

      // Skip weak fuzzy ESIC matching for employees above statutory ₹21,000 ESIC ceiling who have neither an IP number nor an ESIC deduction in Excel
      const skipNonEsicFuzzy =
        !ex.ipNumber &&
        (ex.excelIP === null || ex.excelIP === 0) &&
        ex.grossWages > 21000;

      if (!esicMatch && !skipNonEsicFuzzy) {
        let bestIdx = -1;
        let bestSim = 0;
        for (let rIdx = 0; rIdx < esicRows.length; rIdx++) {
          if (matchedEsicIdx.has(rIdx)) continue;
          const sim = computeNameSimilarity(ex.name, esicRows[rIdx].name);
          if (sim > bestSim) {
            bestSim = sim;
            bestIdx = rIdx;
          }
        }

        const minRequiredEsicSim =
          !ex.ipNumber && (ex.excelIP === null || ex.excelIP === 0)
            ? 88
            : Math.min(68, settings.fuzzyNameThreshold - 5);

        if (bestIdx !== -1 && bestSim >= minRequiredEsicSim) {
          const candidateEsic = esicRows[bestIdx];
          // Avoid pulling a 100% UAN-verified EPF employee into Needs Review for a ₹0 "No Work" ESIC line when Excel has blank IP
          const isZeroNoWorkNoise =
            !ex.ipNumber &&
            ex.excelIP === null &&
            candidateEsic.esicIP === 0 &&
            epfMatch !== null &&
            epfConf === 100;

          if (!isZeroNoWorkNoise) {
            esicMatch = candidateEsic;
            matchedEsicIdx.add(bestIdx);
            esicConf = !ex.ipNumber && bestSim >= 95 ? 90 : bestSim;
            const reason = !ex.ipNumber
              ? `Excel IP number is blank; matched "${esicMatch.name}" in ESIC IP (${esicConf}% similarity).`
              : `IP number mismatch or variation; fuzzy matched "${esicMatch.name}" (${esicConf}% similarity).`;
            esicNote = reason;

            if (esicConf < 98 || (!ex.ipNumber && settings.strictUanMatching)) {
              manualCandidates.push({
                id: `mr-esic-${i + 1}`,
                employeeRecordId: recId,
                excelName: ex.name,
                empCode: ex.empCode,
                excelUan: ex.uan,
                excelIp: ex.ipNumber,
                suggestedPdfName: esicMatch.name,
                pdfSource: 'ESIC IP PDF',
                pdfUanOrIp: esicMatch.ipNumber ?? 'N/A',
                confidence: esicConf,
                reason,
                decision: 'Pending',
                excelAmount: ex.excelIP,
                pdfAmount: esicMatch.esicIP,
              });
            }
          }
        }
      }
    }

    const overallConf = Math.min(epfConf, esicConf);
    const sourceNotesParts = [
      `Excel ${ex.worksheetName ? `Sheet "${ex.worksheetName}" ` : ''}Row #${ex.rowIndex}`,
      epfNote || (hasEpf ? 'Not matched in EPF ECR' : null),
      esicNote || (hasEsic ? 'Not matched in ESIC IP' : null),
      esicMatch?.reason ? `ESIC reason: ${esicMatch.reason}` : null,
    ].filter(Boolean);

    const baseRecord: EmployeeAuditRecord = {
      id: recId,
      empCode: ex.empCode,
      name: ex.name,
      department: ex.department,
      contractorName: ex.worksheetName ?? null,
      uan: ex.uan ?? epfMatch?.uan ?? null,
      ipNumber: ex.ipNumber ?? esicMatch?.ipNumber ?? null,
      attendanceDays: ex.attendanceDays,
      workingDays: ex.workingDays,
      grossWages: ex.grossWages,
      excelEE: ex.excelEE,
      epfEE: epfMatch ? epfMatch.epfEE : null,
      excelIP: ex.excelIP,
      esicIP: esicMatch ? esicMatch.esicIP : null,
      esicReason: esicMatch?.reason ?? null,
      status: 'Matched',
      flagReason: overallConf < 100 ? epfNote || esicNote : '',
      sourceNotes: sourceNotesParts.join(' · '),
      matchConfidence: overallConf,
    };

    rawRecords.push(classifyRecordWithSettings(baseRecord, settings, { hasEpf, hasEsic }));
  }

  // 3. When NO Excel register is uploaded, surface PDF challan records directly for inspection
  if (!hasExcel) {
    if (hasEpf) {
      epfRows.forEach((epf, idx) => {
        if (matchedEpfIdx.has(idx)) return;
        let pairedEsicIdx = -1;
        if (hasEsic && esicRows.length <= 300) {
          let bestSim = 0;
          esicRows.forEach((esic, eIdx) => {
            if (matchedEsicIdx.has(eIdx)) return;
            const sim = computeNameSimilarity(epf.name, esic.name);
            if (sim >= 85 && sim > bestSim) {
              bestSim = sim;
              pairedEsicIdx = eIdx;
            }
          });
          if (pairedEsicIdx !== -1) matchedEsicIdx.add(pairedEsicIdx);
        }
        const pairedEsic = pairedEsicIdx !== -1 ? esicRows[pairedEsicIdx] : null;
        const baseRec: EmployeeAuditRecord = {
          id: `scan-epf-only-${idx + 1}`,
          empCode: `PDF-EPF-${idx + 1}`,
          name: epf.name,
          department: 'EPF Challan',
          uan: epf.uan,
          ipNumber: pairedEsic?.ipNumber ?? null,
          attendanceDays: pairedEsic?.paidDays ?? 0,
          workingDays: 26,
          grossWages: epf.epfWages ?? pairedEsic?.wages ?? 0,
          excelEE: null,
          epfEE: epf.epfEE,
          excelIP: null,
          esicIP: pairedEsic?.esicIP ?? null,
          status: 'Missing Record',
          flagReason: 'Present in statutory PDF challan; upload Attendance / Salary Excel to verify.',
          sourceNotes: `EPF ECR Line #${epf.lineNumber}${pairedEsic ? ` · ESIC Line #${pairedEsic.lineNumber}` : ''}`,
          matchConfidence: 100,
        };
        rawRecords.push(classifyRecordWithSettings(baseRec, settings, { hasEpf, hasEsic }));
      });
    }

    if (hasEsic) {
      esicRows.forEach((esic, idx) => {
        if (matchedEsicIdx.has(idx)) return;
        const baseRec: EmployeeAuditRecord = {
          id: `scan-esic-only-${idx + 1}`,
          empCode: `PDF-ESI-${idx + 1}`,
          name: esic.name,
          department: 'ESIC Challan',
          uan: null,
          ipNumber: esic.ipNumber,
          attendanceDays: esic.paidDays ?? 0,
          workingDays: 26,
          grossWages: esic.wages ?? 0,
          excelEE: null,
          epfEE: null,
          excelIP: null,
          esicIP: esic.esicIP,
          status: 'Missing Record',
          flagReason: 'Present in ESIC IP PDF; upload Attendance / Salary Excel to verify.',
          sourceNotes: `ESIC IP Line #${esic.lineNumber}`,
          matchConfidence: 100,
        };
        rawRecords.push(classifyRecordWithSettings(baseRec, settings, { hasEpf, hasEsic }));
      });
    }
  }

  return { records: rawRecords, manualCandidates };
}
