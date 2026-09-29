/**
 * 厨房听觉与原生 Web Audio API 微音效引擎
 * 纯原生合成，0 外部音频文件网络依赖，轻量安全
 */

let sharedAudioCtx: AudioContext | null = null;

/**
 * 获取或懒加载全局 AudioContext，并处理浏览器自动播放策略限制
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }

    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    return sharedAudioCtx;
  } catch (err) {
    console.warn('[Sound] Web Audio API init failed:', err);
    return null;
  }
}

/**
 * 1. 倒计时归零时发出清脆温和的双音节烘焙烤箱“叮咚~”清透正弦波音
 * 穿透厨房环境嘈杂，温润提示火候
 */
export function playTimerDoneSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // --- 音节一: "叮" (高音 C6 1046.5Hz + 纯净泛音) ---
    const dingOsc = ctx.createOscillator();
    const dingHarmonic = ctx.createOscillator();
    const dingGain = ctx.createGain();

    dingOsc.type = 'sine';
    dingOsc.frequency.setValueAtTime(1046.5, now);

    dingHarmonic.type = 'sine';
    dingHarmonic.frequency.setValueAtTime(2093, now); // 高八度谐波增加金属烤箱清亮质感

    dingGain.gain.setValueAtTime(0.0001, now);
    dingGain.gain.exponentialRampToValueAtTime(0.28, now + 0.015);
    dingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    dingOsc.connect(dingGain);
    dingHarmonic.connect(dingGain);
    dingGain.connect(ctx.destination);

    dingOsc.start(now);
    dingHarmonic.start(now);
    dingOsc.stop(now + 0.55);
    dingHarmonic.stop(now + 0.55);

    // --- 音节二: "咚" (中音 G5 783.99Hz + 饱满余韵) ---
    const dongTime = now + 0.28;
    const dongOsc = ctx.createOscillator();
    const dongHarmonic = ctx.createOscillator();
    const dongGain = ctx.createGain();

    dongOsc.type = 'sine';
    dongOsc.frequency.setValueAtTime(783.99, dongTime);

    dongHarmonic.type = 'sine';
    dongHarmonic.frequency.setValueAtTime(1567.98, dongTime);

    dongGain.gain.setValueAtTime(0.0001, dongTime);
    dongGain.gain.exponentialRampToValueAtTime(0.32, dongTime + 0.02);
    dongGain.gain.exponentialRampToValueAtTime(0.0001, dongTime + 0.85);

    dongOsc.connect(dongGain);
    dongHarmonic.connect(dongGain);
    dongGain.connect(ctx.destination);

    dongOsc.start(dongTime);
    dongHarmonic.start(dongTime);
    dongOsc.stop(dongTime + 0.85);
    dongHarmonic.stop(dongTime + 0.85);
  } catch (err) {
    console.warn('[Sound] playTimerDoneSound failed:', err);
  }
}

/**
 * 2. 完成下厨结算打勾时发出欢快清澈的上升和弦音
 * 模拟烹饪完成的成就喜悦 (G5 -> C6 -> E6 -> G6)
 */
export function playCookSuccessSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 783.99, time: 0.00, dur: 0.35, gain: 0.22 },  // G5
      { freq: 1046.50, time: 0.08, dur: 0.40, gain: 0.24 }, // C6
      { freq: 1318.51, time: 0.16, dur: 0.45, gain: 0.26 }, // E6
      { freq: 1567.98, time: 0.24, dur: 0.75, gain: 0.28 }, // G6 丰满余韵
    ];

    notes.forEach((note) => {
      const noteTime = now + note.time;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle'; // 三角波比正弦波更显温润明亮
      osc.frequency.setValueAtTime(note.freq, noteTime);

      gain.gain.setValueAtTime(0.0001, noteTime);
      gain.gain.exponentialRampToValueAtTime(note.gain, noteTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + note.dur);
    });
  } catch (err) {
    console.warn('[Sound] playCookSuccessSound failed:', err);
  }
}

/**
 * 3. 移动端快门拍照点击时的清脆微弱物理快门声
 * 双段微机械快门帘释放与合拢质感
 */
export function playShutterSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 前帘释放微脆声 (短白噪脉冲 + 带通滤波)
    const bufferSize = Math.floor(ctx.sampleRate * 0.04);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise1 = ctx.createBufferSource();
    whiteNoise1.buffer = noiseBuffer;

    const filter1 = ctx.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.setValueAtTime(2800, now);
    filter1.Q.setValueAtTime(3.0, now);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    whiteNoise1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(ctx.destination);

    whiteNoise1.start(now);
    whiteNoise1.stop(now + 0.035);

    // 后帘合拢机械咔哒声 (0.055秒后，略低频微沉机械感)
    const secondClickTime = now + 0.055;
    const whiteNoise2 = ctx.createBufferSource();
    whiteNoise2.buffer = noiseBuffer;

    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'bandpass';
    filter2.frequency.setValueAtTime(1400, secondClickTime);
    filter2.Q.setValueAtTime(2.0, secondClickTime);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(0.26, secondClickTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, secondClickTime + 0.04);

    // 微弱低频机械撞击力 (160Hz -> 60Hz 快速下沉)
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snapOsc.type = 'sine';
    snapOsc.frequency.setValueAtTime(160, secondClickTime);
    snapOsc.frequency.exponentialRampToValueAtTime(50, secondClickTime + 0.03);

    snapGain.gain.setValueAtTime(0.18, secondClickTime);
    snapGain.gain.exponentialRampToValueAtTime(0.001, secondClickTime + 0.03);

    snapOsc.connect(snapGain);
    snapGain.connect(ctx.destination);

    whiteNoise2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(ctx.destination);

    whiteNoise2.start(secondClickTime);
    whiteNoise2.stop(secondClickTime + 0.04);
    snapOsc.start(secondClickTime);
    snapOsc.stop(secondClickTime + 0.03);
  } catch (err) {
    console.warn('[Sound] playShutterSound failed:', err);
  }
}
