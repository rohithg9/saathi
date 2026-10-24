// One API for native features. In the iOS/Android app (Capacitor) it uses the native plugins;
// in a browser it falls back to Web APIs. Plugins are looked up at runtime so the web build
// has no hard dependency on them.
//
// Native plugins used (see package.json): @capacitor/local-notifications, @capacitor/push-notifications,
// @capacitor/haptics, @capacitor-community/text-to-speech. Health data: HealthKit (iOS) / Health Connect
// (Android) via a health plugin added in native/ (see docs/WATCH.md). Watch apps sync through the phone.

import i18n from '../i18n.json';

type Lang = 'en' | 'hi' | 'kn' | 'ta';
const P = () => (globalThis as any).Capacitor?.Plugins || {};
export const isNative = () => !!(globalThis as any).Capacitor?.isNativePlatform?.();
export const platform = (): 'ios' | 'android' | 'web' => (globalThis as any).Capacitor?.getPlatform?.() || 'web';

// ---------------- voice ----------------
let voices: SpeechSynthesisVoice[] = [];
try { const load = () => { voices = speechSynthesis.getVoices(); }; load(); speechSynthesis.onvoiceschanged = load; } catch { /* no speech */ }
const score = (v: SpeechSynthesisVoice) => (/natural|neural/i.test(v.name) ? 10 : 0) + (/enhanced|premium|siri/i.test(v.name) ? 8 : 0) + (/online|^google/i.test(v.name) ? 4 : 0);
export function voicesFor(lang: Lang) {
  const tag = (i18n as any)[lang].tts.toLowerCase(); const two = tag.slice(0, 2);
  return voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(two)).sort((a, b) => score(b) - score(a));
}
export let speaking = false;
export async function speak(text: string, lang: Lang, opts: { rate?: number; voiceName?: string } = {}) {
  if (!text) return;
  const tts = P().TextToSpeech;
  speaking = true; document.documentElement.classList.add('saathi-talk');
  const done = () => { speaking = false; document.documentElement.classList.remove('saathi-talk'); };
  try {
    if (isNative() && tts) { await tts.speak({ text, lang: (i18n as any)[lang].tts, rate: opts.rate ?? 0.95, pitch: 1, volume: 1, category: 'playback' }); done(); return; }
    speechSynthesis.cancel();
    const parts = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
    const v = (opts.voiceName && voicesFor(lang).find(x => x.name === opts.voiceName)) || voicesFor(lang)[0];
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = (i18n as any)[lang].tts;
      u.rate = opts.rate ?? 0.95; if (i === parts.length - 1) { u.onend = done; u.onerror = done; } speechSynthesis.speak(u);
    });
    setTimeout(done, 1500 + text.length * 90);
  } catch { done(); }
}
export function stopSpeaking() { try { P().TextToSpeech?.stop?.(); speechSynthesis.cancel(); } catch { /* ignore */ } speaking = false; }

let ctx: AudioContext | null = null;
/** Gentle two-note chime before a voice reminder (Web Audio; native uses saathi_chime.wav). */
export function chime() {
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)(); ctx.resume?.();
    [[659.25, 0], [880, 0.22]].forEach(([f, t]) => { const o = ctx!.createOscillator(); const g = ctx!.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, ctx!.currentTime + t); g.gain.linearRampToValueAtTime(0.18, ctx!.currentTime + t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ctx!.currentTime + t + 0.9); o.connect(g).connect(ctx!.destination); o.start(ctx!.currentTime + t); o.stop(ctx!.currentTime + t + 1); });
  } catch { /* ignore */ }
}
export const unlockAudio = () => { chime(); try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* ignore */ } };

export function haptic(kind: 'light' | 'success' | 'warning' = 'light') {
  const h = P().Haptics; try { if (h) kind === 'light' ? h.impact({ style: 'LIGHT' }) : h.notification({ type: kind === 'success' ? 'SUCCESS' : 'WARNING' }); else navigator.vibrate?.(kind === 'warning' ? [60, 40, 60] : 20); } catch { /* ignore */ }
}

// ---------------- reminders (local notifications) ----------------
export interface Reminder { id: number; title: string; body: string; at: Date; voice?: string; extra?: Record<string, string> }
export async function requestNotificationPermission(): Promise<boolean> {
  const ln = P().LocalNotifications;
  try {
    if (ln) { const r = await ln.requestPermissions(); return r.display === 'granted'; }
    if ('Notification' in window) return (await Notification.requestPermission()) === 'granted';
  } catch { /* ignore */ }
  return false;
}
/** Schedules device notifications for today's reminders. Native: fires even when the app is closed. */
export async function scheduleReminders(list: Reminder[]) {
  const ln = P().LocalNotifications;
  if (ln) {
    const pending = await ln.getPending(); if (pending.notifications?.length) await ln.cancel({ notifications: pending.notifications.map((n: any) => ({ id: n.id })) });
    await ln.schedule({ notifications: list.filter(r => r.at > new Date()).map(r => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true }, sound: 'saathi_chime.wav', channelId: 'saathi-reminders', extra: { ...r.extra, voice: r.voice } })) });
    return 'native';
  }
  // Browser: timers only work while the page is open; that limitation is shown in Settings.
  webTimers.forEach(clearTimeout); webTimers = [];
  for (const r of list) { const ms = r.at.getTime() - Date.now(); if (ms > 0 && ms < 24 * 3600e3) webTimers.push(setTimeout(() => { try { if (Notification.permission === 'granted') new Notification(r.title, { body: r.body, icon: 'icons/icon.svg' }); } catch { /* ignore */ } window.dispatchEvent(new CustomEvent('saathi:reminder', { detail: r })); }, ms) as any); }
  return 'web';
}
let webTimers: any[] = [];
export function onReminderTap(fn: (extra: any) => void) {
  P().LocalNotifications?.addListener?.('localNotificationActionPerformed', (e: any) => fn(e.notification?.extra || {}));
}
export async function createAndroidChannel() {
  try { await P().LocalNotifications?.createChannel?.({ id: 'saathi-reminders', name: 'Saathi reminders', importance: 5, sound: 'saathi_chime.wav', vibration: true }); } catch { /* ignore */ }
}

// ---------------- push (care-team alerts to staff/carers) ----------------
export async function registerPush(onToken: (t: string) => void) {
  const push = P().PushNotifications; if (!push) return false;
  const perm = await push.requestPermissions(); if (perm.receive !== 'granted') return false;
  push.addListener('registration', (t: any) => onToken(t.value)); await push.register(); return true;
}

// ---------------- health & watch ----------------
export interface DaySteps { date: string; steps: number; distanceKm?: number; source: string }
/**
 * Reads steps from HealthKit / Health Connect when the native health plugin is installed
 * (registered as `SaathiHealth`, see native/README.md). Returns null on web.
 */
export async function readSteps(days = 7): Promise<DaySteps[] | null> {
  const h = P().SaathiHealth; if (!h) return null;
  try { const ok = await h.requestAuthorization({ read: ['steps', 'distance', 'heart_rate', 'blood_pressure', 'weight'] }); if (!ok?.granted) return null; const r = await h.querySteps({ days }); return r.days; } catch { return null; }
}
/** Sends today's reminders + goal to the paired watch app (watchOS WatchConnectivity / Wear OS Data Layer). */
export async function syncWatch(payload: { reminders: { time: string; title: string; kind: string }[]; stepGoal?: number; name: string; lang: Lang }) {
  const w = P().SaathiWatch; if (!w) return false;
  try { await w.send({ payload: JSON.stringify(payload) }); return true; } catch { return false; }
}
export const capabilities = () => ({
  native: isNative(), platform: platform(),
  backgroundReminders: !!P().LocalNotifications, nativeVoice: !!P().TextToSpeech, health: !!P().SaathiHealth, watch: !!P().SaathiWatch,
  webNotifications: typeof window !== 'undefined' && 'Notification' in window, webSpeech: typeof window !== 'undefined' && 'speechSynthesis' in window,
  speechInput: typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition),
});

/** Voice input (browser SpeechRecognition; native apps can swap in a speech plugin). */
export function listen(lang: Lang, onText: (t: string, final: boolean) => void): (() => void) | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SR) return null;
  const rec = new SR(); rec.lang = (i18n as any)[lang].tts; rec.interimResults = true; rec.maxAlternatives = 1;
  rec.onresult = (e: any) => { const r = e.results[e.results.length - 1]; onText(r[0].transcript, r.isFinal); };
  rec.start(); return () => { try { rec.stop(); } catch { /* ignore */ } };
}
