// Date helpers in local time. ISODate = YYYY-MM-DD.
export const DAY = 86400000;
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parse = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const today = () => iso(new Date());
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / DAY);
export const weekday = (s: string) => (parse(s).getDay() + 6) % 7; // 0 = Monday
export const fmt = (s: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => parse(s).toLocaleDateString('en-IN', opts);
export const nowIso = () => new Date().toISOString();
export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
