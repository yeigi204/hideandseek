// Hinweise bei neuen Fragen/Curses: Vibration, kurzer Ton und – falls erlaubt und die
// App im Hintergrund ist – eine System-Benachrichtigung.

let audio: AudioContext | null = null;

export function beep() {
  try {
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.35);
  } catch {
    // kein Ton möglich
  }
}

export function vibrate(pattern: number | number[] = [200, 100, 200]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // ignorieren
  }
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

export async function systemNotify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag: 'hideandseek', icon: './icon.svg' });
  } catch {
    // ignorieren
  }
}

export function alertUser(title: string, body: string) {
  vibrate();
  beep();
  void systemNotify(title, body);
}
