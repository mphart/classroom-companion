import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

let workerConfigured = false;
function ensureWorker() {
  if (workerConfigured) return;
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.js`
  workerConfigured = true;
}

/**
 * Renders pages from a PDF blob URL on demand and caches the result as data URLs.
 * Use the returned `getPage(n)` to fetch a rendered slide; it returns `null` until ready.
 */
export function useSlideRenderer(blobUrl: string | null) {
  const [pageCount, setPageCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [, setRenderTick] = useState(0);

  const docRef = useRef<PdfDocument | null>(null);
  const cacheRef = useRef<Map<number, string>>(new Map());
  const inFlightRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setPageCount(0);
    cacheRef.current = new Map();
    inFlightRef.current = new Set();
    if (docRef.current) {
      void docRef.current.destroy();
      docRef.current = null;
    }
    if (!blobUrl) return;
    ensureWorker();
    const task = pdfjsLib.getDocument(blobUrl);
    void task.promise
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF.');
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
  }, [blobUrl]);

  function getPage(n: number): string | null {
    if (!docRef.current) return null;
    const pages = pageCount;
    if (pages === 0) return null;
    const safe = Math.min(Math.max(1, Math.floor(n)), pages);
    const cached = cacheRef.current.get(safe);
    if (cached) return cached;
    if (inFlightRef.current.has(safe)) return null;
    inFlightRef.current.add(safe);
    void renderPage(docRef.current, safe)
      .then((dataUrl) => {
        cacheRef.current.set(safe, dataUrl);
        inFlightRef.current.delete(safe);
        setRenderTick((t) => t + 1);
      })
      .catch(() => {
        inFlightRef.current.delete(safe);
      });
    return null;
  }

  return { pageCount, error, getPage };
}

async function renderPage(doc: PdfDocument, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  // ~1.5x base for crisp text on retina; `toDataURL` keeps memory bounded once cached.
  const baseViewport = page.getViewport({ scale: 1 });
  const targetWidth = 960;
  const scale = Math.min(2.5, Math.max(1, targetWidth / baseViewport.width));
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d');
  if (!context) {
    page.cleanup();
    throw new Error('Could not get a 2D canvas context for rendering.');
  }
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  const url = canvas.toDataURL('image/png');
  page.cleanup();
  return url;
}
