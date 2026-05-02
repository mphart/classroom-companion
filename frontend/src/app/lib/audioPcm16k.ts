/** Downmix / downsample input float mono samples toward 16 kHz PCM s16le for Deepgram `linear16`. */
export function floatToPCM16(samples: Float32Array, sampleRate: number): Int16Array {
  if (!samples.length) return new Int16Array(0);

  let resampled = samples;
  if (sampleRate !== 16_000) {
    const ratio = sampleRate / 16_000;
    const outLen = Math.floor(samples.length / ratio);
    resampled = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.floor((i + 1) * ratio);
      let sum = 0;
      let c = 0;
      for (let j = start; j < end && j < samples.length; j++) {
        sum += samples[j];
        c++;
      }
      resampled[i] = c ? sum / c : 0;
    }
  }

  const pcm = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    const sample = Math.max(-1, Math.min(1, resampled[i] ?? 0));
    pcm[i] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
  }
  return pcm;
}
