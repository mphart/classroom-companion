export const generateSummary = (texts: string[]): string => {
  const merged = texts.join(" ").replace(/\s+/g, " ").trim();
  if (!merged) return "No content available to summarize.";
  const firstChunk = merged.slice(0, 900);
  return `Summary:\n\n${firstChunk}${merged.length > 900 ? "..." : ""}`;
};
