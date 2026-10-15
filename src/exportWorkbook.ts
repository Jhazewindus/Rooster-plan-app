import { strToU8, zipSync } from 'fflate';
import { dateKey, durationMinutes, PlannerData, Shift } from './domain';
import { workedMinutes } from './planner';

const MONTHS = ['Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni', 'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December'];
type Cell = string | number;

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function column(index: number): string {
  let label = '';
  for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  return label;
}

function sheet(rows: Cell[][], widths: number[]): string {
  const columns = widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('');
  const body = rows.map((cells, rowIndex) => `<row r="${rowIndex + 1}">${cells.map((value, index) => {
    const address = `${column(index)}${rowIndex + 1}`;
    return typeof value === 'number'
      ? `<c r="${address}" s="${rowIndex === 0 ? 1 : 0}"><v>${value}</v></c>`
      : `<c r="${address}" s="${rowIndex === 0 ? 1 : 0}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const last = Math.max(1, rows.length);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${columns}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${column(widths.length - 1)}${last}"/></worksheet>`;
}

function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const first = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  return Math.ceil((((day.getTime() - first.getTime()) / 86400000) + 1) / 7);
}

export function shiftsForYear(data: PlannerData, year: number): Shift[] {
  return data.schedules.flatMap((schedule) => schedule.shifts)
    .filter((shift) => new Date(shift.startAt).getFullYear() === year)
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id));
}

/** Build a real Excel workbook, including open shifts and net hours after scheduled breaks. */
export function createYearWorkbook(data: PlannerData, year: number): Uint8Array {
  const shifts = shiftsForYear(data, year);
  const details: Cell[][] = [['Datum', 'Week', 'Medewerker', 'Functie', 'Van', 'Tot', 'Pauze (min)', 'Werkuren', 'Status', 'Notitie']];
  const monthly = MONTHS.map((name) => ({ name, assigned: 0, open: 0, minutes: 0, paidInternMinutes: 0 }));
  for (const shift of shifts) {
    const start = new Date(shift.startAt);
    const end = new Date(shift.endAt);
    const employee = data.employees.find((item) => item.id === shift.employeeId);
    const net = workedMinutes(shift, data.settings);
    const month = monthly[start.getMonth()];
    if (shift.employeeId) { month.assigned++; month.minutes += net; if (shift.paidInternShift) month.paidInternMinutes += net; } else month.open++;
    details.push([
      dateKey(start), isoWeek(start), employee?.displayName ?? (shift.employeeId ? 'Onbekend' : 'Open dienst'),
      employee?.role ?? '', time(start), time(end), shift.employeeId ? durationMinutes(shift) - net : 0,
      Math.round(net / 60 * 100) / 100, shift.employeeId ? shift.paidInternShift ? 'Betaalde dienst' : 'Ingepland' : 'Open', shift.notes,
    ]);
  }
  const summary: Cell[][] = [['Maand', 'Ingeplande diensten', 'Open diensten', 'Werkuren', 'Betaalde stage-uren'],
    ...monthly.map((month) => [month.name, month.assigned, month.open, Math.round(month.minutes / 60 * 100) / 100, Math.round(month.paidInternMinutes / 60 * 100) / 100] as Cell[]),
    ['Totaal', monthly.reduce((sum, month) => sum + month.assigned, 0), monthly.reduce((sum, month) => sum + month.open, 0), Math.round(monthly.reduce((sum, month) => sum + month.minutes, 0) / 60 * 100) / 100, Math.round(monthly.reduce((sum, month) => sum + month.paidInternMinutes, 0) / 60 * 100) / 100]];
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Maandoverzicht" sheetId="1" r:id="rId1"/><sheet name="Diensten" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFB76445"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(sheet(summary, [18, 23, 17, 15, 22])),
    'xl/worksheets/sheet2.xml': strToU8(sheet(details, [16, 9, 24, 22, 10, 10, 16, 13, 14, 35])),
  };
  return zipSync(entries, { level: 6 });
}

function time(value: Date): string { return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`; }
