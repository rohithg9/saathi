// Word (.docx) care-pathway import. Reads schedule tables (Day | Time | Repeat | Who | Category | Action | Notes)
// into pathway items. The result is always a DRAFT protocol: a clinician reviews, edits and approves it.
// Convention: "Day 1" in the document = day of surgery/start = day index 0 in Saathi. Negative days are pre-op.

import type { PathwayItem, PathwayWho } from '../data/types';

const pad = (n: number) => String(n).padStart(2, '0');
export function parseDays(s: string): { from: number; to: number } | null {
  s = String(s || '').replace(/[–—]/g, '-').trim();
  let m = /^(?:day\s*)?(-?\d+)\s*(?:-\s*(?:day\s*)?(-?\d+))?$/i.exec(s);
  const idx = (n: number) => (n >= 1 ? n - 1 : n);
  if (m) { const a = +m[1], b = m[2] != null ? +m[2] : a; return { from: idx(a), to: idx(Math.max(a, b)) }; }
  m = /^weeks?\s*(\d+)(?:\s*-\s*(\d+))?$/i.exec(s);
  if (m) { const a = +m[1], b = m[2] ? +m[2] : a; return { from: (a - 1) * 7, to: b * 7 - 1 }; }
  return null;
}
const WHO_MAP: [RegExp, PathwayWho][] = [[/liaison|coordinator|navigator/i, 'liaison'], [/patient/i, 'patient'], [/carer|family|relative/i, 'carer'], [/nurse/i, 'nurse'], [/physio/i, 'physio'], [/dietitian|nutrition/i, 'dietitian'], [/pharmac/i, 'pharmacist'], [/doctor|surgeon|consultant|physician|oncologist/i, 'doctor']];
const CAT_MAP: [RegExp, string][] = [[/medic|drug|tablet/i, 'Medication'], [/exercise/i, 'Exercise'], [/walk/i, 'Walk'], [/diet|food|meal/i, 'Diet'], [/check-?in/i, 'Check-in'], [/lab|test|blood/i, 'Lab'], [/wound/i, 'Wound'], [/appointment|clinic|visit/i, 'Appointment'], [/review/i, 'Review'], [/phone|call/i, 'Call'], [/educat|class|teach/i, 'Education'], [/procedure|surgery|operation/i, 'Procedure']];
const mapBy = <T,>(arr: [RegExp, T][], s: string): T | null => { for (const [r, v] of arr) if (r.test(s || '')) return v; return null; };
function repeatOf(s: string, times: string[]): PathwayItem['repeat'] {
  const t = String(s || '').toLowerCase();
  if (/once|single|one-off/.test(t)) return 'once'; if (/week/.test(t)) return 'weekly'; if (/month/.test(t)) return 'monthly';
  if (/3|three|thrice/.test(t)) return 'thrice'; if (/twice|2 times|two/.test(t)) return 'twice'; if (/daily|every day/.test(t)) return 'daily';
  return times.length > 2 ? 'thrice' : times.length === 2 ? 'twice' : 'daily';
}

export function parseScheduleTables(tables: string[][][]): PathwayItem[] {
  const items: PathwayItem[] = [];
  for (const t of tables) {
    if (!t || t.length < 2) continue;
    const h = t[0].map(x => String(x).toLowerCase().trim());
    const col = (...ks: string[]) => h.findIndex(x => ks.some(k => x.startsWith(k)));
    const ci = { day: col('day', 'when'), time: col('time'), rep: col('repeat', 'frequency'), who: col('who', 'role', 'responsible'), cat: col('category', 'type'), act: col('action', 'task', 'activity'), notes: col('note', 'detail', 'comment') };
    if (ci.day < 0 || ci.who < 0 || ci.act < 0) continue;
    for (const r of t.slice(1)) {
      const days = parseDays(r[ci.day]); const title = String(r[ci.act] || '').trim(); if (!days || !title) continue;
      const times = (((ci.time >= 0 ? r[ci.time] : '') || '').match(/\d{1,2}[:.]\d{2}/g) || []).map(x => { const [a, b] = x.split(/[:.]/); return `${pad(+a)}:${b}`; });
      const who = mapBy(WHO_MAP, r[ci.who]); const type = (ci.cat >= 0 && r[ci.cat] ? mapBy(CAT_MAP, r[ci.cat]) : null) || mapBy(CAT_MAP, title);
      let repeat = repeatOf(ci.rep >= 0 ? r[ci.rep] : '', times); if (days.from === days.to) repeat = 'once';
      items.push({ id: 'pi_' + Math.random().toString(36).slice(2, 8), who: who || 'patient', type: type || 'Task', title: title.slice(0, 140), from: days.from, to: days.to, times, repeat, notes: ci.notes >= 0 ? String(r[ci.notes] || '').slice(0, 200) : '', flag: !who || !type });
    }
  }
  return items;
}

/** Reads tables and paragraphs from a .docx (Office Open XML) using JSZip. */
export async function readDocx(file: Blob, JSZip: any): Promise<{ tables: string[][][]; paras: string[] }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const f = zip.file('word/document.xml'); if (!f) throw new Error('Not a Word document');
  const dom = new DOMParser().parseFromString(await f.async('string'), 'application/xml');
  const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const ptext = (p: Element) => [...p.getElementsByTagNameNS(NS, 't')].map(t => t.textContent).join('');
  const tables = [...dom.getElementsByTagNameNS(NS, 'tbl')].map(tb => [...tb.getElementsByTagNameNS(NS, 'tr')].map(tr => [...tr.getElementsByTagNameNS(NS, 'tc')].map(tc => [...tc.getElementsByTagNameNS(NS, 'p')].map(ptext).filter(Boolean).join(', '))));
  const body = dom.getElementsByTagNameNS(NS, 'body')[0];
  const paras = [...body.childNodes].filter((n: any) => n.localName === 'p').map((n: any) => ptext(n)).filter(x => x.trim());
  return { tables, paras };
}

/** Plain-text fallback: lines like "Day 3–35 | 08:00, 20:00 | Patient | Medication | Apixaban 2.5 mg". */
export function parseText(text: string): PathwayItem[] {
  const rows = text.split(/\n+/).map(l => l.split(/\s*[|\t]\s*/)).filter(r => r.length >= 4);
  return parseScheduleTables([[['day', 'time', 'who', 'category', 'action', 'notes'], ...rows.map(r => r.length === 5 ? [r[0], r[1], r[2], r[3], r[4], ''] : r)]]);
}
