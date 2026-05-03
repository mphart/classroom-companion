import '@/styles/brand-ambient.css';

/**
 * Extra ambient depth (drifting mesh + slow panning grid) behind page content.
 * Pair with existing `brand-ambient-blob-*` layers; respects `prefers-reduced-motion` in CSS.
 */
export function PageAmbientDecor() {
  return (
    <>
      <div className="page-ambient-mesh" aria-hidden />
      <div className="page-ambient-grid" aria-hidden />
    </>
  );
}
