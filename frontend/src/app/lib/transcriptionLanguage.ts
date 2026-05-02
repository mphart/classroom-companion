/** Match labels in ActiveRecording language dropdown. */
export function uiLanguageToDeepgramCode(label: string): string {
  const map: Record<string, string> = {
    English: 'en',
    Spanish: 'es',
    French: 'fr',
    German: 'de',
    Mandarin: 'zh',
  };
  return map[label] ?? 'en';
}
