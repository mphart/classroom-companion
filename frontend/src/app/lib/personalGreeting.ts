/** First word of display name for casual greetings. */
export function firstNameFromDisplayName(name: string): string {
  const t = name.trim();
  if (!t) return 'there';
  return t.split(/\s+/)[0] ?? 'there';
}

export function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Two-letter avatar from name, or username. */
export function userInitials(displayName: string, username: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0][0];
    const b = parts[parts.length - 1][0];
    if (a && b) return `${a}${b}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0].length >= 2) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const u = username.trim();
  return (u.slice(0, 2) || '?').toUpperCase();
}
