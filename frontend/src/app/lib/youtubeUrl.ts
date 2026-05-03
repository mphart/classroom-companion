/** Aligns with backend `isLikelyYoutubeVideoUrl` for client-side checks. */
export function isLikelyYoutubeVideoUrl(raw: string): boolean {
  try {
    const trimmed = raw.trim();
    const withScheme = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    const h = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (h === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0] ?? '';
      return Boolean(id && /^[\w-]{6,}$/.test(id));
    }
    if (h === 'youtube.com' || h === 'm.youtube.com' || h === 'music.youtube.com') {
      if (u.pathname === '/watch') {
        const v = u.searchParams.get('v');
        return Boolean(v && /^[\w-]{6,}$/.test(v));
      }
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.slice('/shorts/'.length).split('/')[0] ?? '';
        return Boolean(id && /^[\w-]{6,}$/.test(id));
      }
    }
    return false;
  } catch {
    return false;
  }
}
