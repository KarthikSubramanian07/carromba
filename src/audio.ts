// All of Carromba's sound is synthesized on the fly with the Web Audio API, so
// there are no audio files to download and nothing to load. A clack is a short
// filtered noise burst; a pocket is a soft wooden thunk with a little pitch drop.
// Muting is instant and remembered.

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Browsers start the context suspended until a gesture resumes it.
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setMuted(value: boolean): void {
  muted = value;
}

/** Call from the first user gesture so audio is unlocked on mobile. */
export function unlockAudio(): void {
  ac();
}

// A short burst of filtered noise: the click of two discs meeting.
export function playClack(strength: number): void {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.06;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * env * env;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1600 + Math.min(1, strength / 1600) * 1400;
  band.Q.value = 0.9;

  const gain = c.createGain();
  const vol = Math.min(0.5, 0.12 + strength / 4000);
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(band).connect(gain).connect(c.destination);
  src.start(now);
  src.stop(now + dur);
}

// A rounded thunk with a downward pitch bend: a man dropping into a pocket.
export function playPocket(): void {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(340, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.16);

  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.3);
}

// A soft rising chime for a win.
export function playWin(): void {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const gain = c.createGain();
    const t = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  });
}
