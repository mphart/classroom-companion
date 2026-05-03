import path from "node:path";

/** Absolute directory where slide PDFs are stored (`PDF_UPLOAD_DIR` or `./uploads/pdfs` under cwd). */
export function getPdfUploadRoot(): string {
  const raw = process.env.PDF_UPLOAD_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.resolve(process.cwd(), "uploads", "pdfs");
}
