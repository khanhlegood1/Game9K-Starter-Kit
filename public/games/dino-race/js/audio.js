/**
 * audio.js
 * Procedural Web Audio API Sound FX Synthesizer for Jurassic Sanctuary Sprint.
 *
 * - Zero external MP3/WAV downloads (instant load, tiny bundle)
 * - Auto-unlocks AudioContext on first user gesture (Safari iOS & TikTok WebView safe)
 * - Respects Google H5 Ad Placement API mute hooks (`setAdMute`)
 */

export function createSoundFX() {
  let ctx = null;
  let enabled = true;
  let mutedByAd = false;

  function init() {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  if (typeof window !== "undefined") {
    ["pointerdown", "touchstart", "keydown"].forEach((evt) => {
      window.addEventListener(evt, init, { once: true, passive: true });
    });
  }

  function canPlay() {
    return enabled && !mutedByAd;
  }

  function playRoar() {
    if (!canPlay()) return;
    init();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(148, now);
    osc.frequency.exponentialRampToValueAtTime(46, now + 0.58);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(750, now);
    filter.frequency.linearRampToValueAtTime(220, now + 0.58);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.62);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.64);
  }

  function playBite() {
    if (!canPlay()) return;
    init();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.13);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  function playSlip() {
    if (!canPlay()) return;
    init();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.linearRampToValueAtTime(240, now + 0.16);
    osc.frequency.linearRampToValueAtTime(520, now + 0.32);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  function playMeteorImpact() {
    if (!canPlay()) return;
    init();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.48);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.52);
  }

  function playGiftFanfare(grand = false) {
    if (!canPlay()) return;
    init();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = grand
      ? [523.25, 659.25, 783.99, 1046.5, 1318.5]
      : [440, 554.37, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.16, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.26);
    });
  }

  function playBeep(high = false) {
    if (!canPlay()) return;
    init();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(high ? 880 : 440, now);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  return {
    init,
    playRoar,
    playBite,
    playSlip,
    playMeteorImpact,
    playGiftFanfare,
    playBeep,
    setAdMute(mute) {
      mutedByAd = Boolean(mute);
    },
    toggle() {
      enabled = !enabled;
      return enabled;
    },
    isEnabled() {
      return enabled;
    },
  };
}
