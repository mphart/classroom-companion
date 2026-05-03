/**
 * Extract printable text per page from a PDF buffer (pdf.js; works in Node without Vitest loading quirks).
 */
export async function extractPdfTextWithSlideMarkers(buffer: Buffer): Promise<{
  rawText: string;
  pageCount: number;
}> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((item) => {
        if (typeof item === "object" && item !== null && "str" in item && typeof (item as { str: unknown }).str === "string") {
          return (item as { str: string }).str;
        }
        return "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pageTexts.push(line);
  }

  const nonempty = pageTexts.filter((t) => t.length > 0);
  if (nonempty.length === 0) {
    return {
      rawText:
        "(No extractable text from this PDF — it may be image-only. You can still view the slides; OCR is not enabled.)",
      pageCount: Math.max(1, pageCount),
    };
  }

  const rawText = pageTexts
    .map((p, i) => `--- Slide ${i + 1} ---\n\n${p.length > 0 ? p : "(no text on this slide)"}`)
    .join("\n\n");

  return { rawText, pageCount };
}
