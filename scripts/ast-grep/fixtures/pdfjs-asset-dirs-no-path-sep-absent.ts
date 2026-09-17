// Violation fixture for pdfjs-asset-dirs-no-path-sep's presence branch: the
// function was renamed, so the ban above would guard nothing (fires once).
export function pdfAssetDirectories(): { cMapUrl?: string } {
  return { cMapUrl: '/pdfjs/cmaps/' };
}
export const DEFAULT_PDF_PAGES = 10;
