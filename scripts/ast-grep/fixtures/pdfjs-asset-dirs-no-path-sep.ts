// Violation fixture for pdfjs-asset-dirs-no-path-sep: the Windows bug's own
// shape (path.sep as the trailing slash — fires once, in the function), and a
// comment between the function and DEFAULT_PDF_PAGES that the old text slice
// also covered (fires once).
import * as path from 'path';

export function pdfjsAssetDirs(): { standardFontDataUrl?: string; cMapUrl?: string } {
  const root = '/pdfjs';
  return { standardFontDataUrl: path.join(root, 'standard_fonts') + '/', cMapUrl: path.join(root, 'cmaps') + path.sep };
}

// TODO: switch the slash back to path.sep
export const DEFAULT_PDF_PAGES = 10;
