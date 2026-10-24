// Safety layer around anything Saathi says.
// 1) Emergency classifier on patient text (deterministic keywords, en + hi/kn/ta romanised + native script).
// 2) Output checker: blocks any reply that tells a patient to start/stop/change/double/skip a dose.

export interface EmergencyHit { kind: 'chest_pain' | 'breathing' | 'stroke' | 'bleeding' | 'unconscious' | 'self_harm' | 'allergy' | 'seizure'; tier: 'red'; crisis?: boolean; matched: string }

const PATTERNS: [EmergencyHit['kind'], RegExp, boolean?][] = [
  ['chest_pain', /chest (pain|tight|pressure)|seene? (me|mein) dard|सीने में दर्द|ಎದೆ ನೋವು|நெஞ்சு வலி/i],
  ['breathing', /can'?t breathe|cannot breathe|difficulty breathing|struggling to breathe|saans (nahi|nahin)|सांस (नहीं|लेने में)|ಉಸಿರಾಡ(ಲು|ಲಾಗ)|மூச்சு (விட|திணறல்)/i],
  ['stroke', /face (droop|drooping)|slurred speech|one side (weak|numb)|can'?t move (my )?(arm|leg)|लकवा|ಪಾರ್ಶ್ವವಾಯು|பக்கவாதம்/i],
  ['bleeding', /vomit(ing)? blood|blood in (vomit|stool)|black (tarry )?stool|bleeding (won'?t|will not) stop|heavy bleeding|खून की उल्टी|ರಕ್ತ ವಾಂತಿ|இரத்த வாந்தி/i],
  ['unconscious', /unconscious|passed out|not waking|fainted and|बेहोश|ಪ್ರಜ್ಞೆ ತಪ್ಪಿ|மயக்க/i],
  ['allergy', /(lips?|tongue|throat|face) (is |are )?swell|swollen (lips?|tongue|throat)|anaphyla/i],
  ['seizure', /seizure|fit(s)? (now|again)|convulsion|दौरा|ಫಿಟ್ಸ್|வலிப்பு/i],
  ['self_harm', /kill myself|end my life|suicid|want to die|harm myself|hurt myself|मर जाना चाहता|आत्महत्या|ಆತ್ಮಹತ್ಯೆ|தற்கொலை/i, true],
];

export function detectEmergency(text: string): EmergencyHit | null {
  for (const [kind, re, crisis] of PATTERNS) { const m = text.match(re); if (m) return { kind, tier: 'red', crisis: !!crisis, matched: m[0] }; }
  return null;
}

const DOSE_CHANGE = [
  /\b(stop|discontinue|quit|halt|pause)\b[^.]{0,40}\b(tablet|medicine|medication|dose|insulin|pill|drug|treatment|it)\b/i,
  /\b(double|skip|miss|increase|decrease|reduce|halve|cut)\b[^.]{0,30}\b(dose|tablet|insulin|pill|medicine|units?)\b/i,
  /\btake (an )?(extra|another|two|2|more|less|half)\b[^.]{0,20}\b(tablet|dose|pill|units?)\b/i,
  /\b(start|begin|stop|quit|discontinue) (taking|using)\b/i,
  /\b(बंद कर|दोगुन|छोड़ द)/,
];
export const SAFE_DOSE_REPLY = "I can't advise changing how you take your medicines. I've sent your question to your care team, and they will reply. If you feel very unwell, call your hospital's emergency number.";

/** Returns the text to show: the original if safe, otherwise the safe redirect. */
export function checkOutput(text: string): { ok: boolean; text: string; reason?: string } {
  for (const re of DOSE_CHANGE) if (re.test(text)) return { ok: false, text: SAFE_DOSE_REPLY, reason: `blocked: ${re.source.slice(0, 40)}` };
  return { ok: true, text };
}

/** Strip obvious identifiers before anything is logged (no PHI in logs). */
export function redact(s: string): string {
  return s.replace(/\b\d{10}\b/g, '[phone]').replace(/\+91[\s-]?\d{5}[\s-]?\d{5}/g, '[phone]').replace(/\b\d{2}-\d{4}-\d{4}-\d{4}\b/g, '[abha]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]');
}
