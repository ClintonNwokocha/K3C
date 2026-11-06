// Renders a single logo mark cropped out of the official K3C master
// artwork sheets (each file bundles a navy-text instance, a white-text
// instance and an icon-only instance on one large canvas). Cropping is
// done entirely with CSS (aspect-ratio + percentage-based absolute
// positioning derived from each instance's exact bounding box) — no shape
// or colour in the artwork is touched. The only edit made to the source
// files themselves is a typography refinement to the "KADUNA CLIMATE /
// CHANGE COMMAND" subtitle (larger size, more line spacing); the
// pre-refinement originals are kept as k3c-*-original.svg for reference.
const CANVAS_WIDTH = 17000;
const CANVAS_HEIGHT = 25000;

// Bounding boxes (SVG user units) of each named instance within its
// source file, measured via the browser's own getBBox(). Re-measured after
// the "KADUNA CLIMATE / CHANGE COMMAND" subtitle was enlarged and given
// more leading (see k3c-*-original.svg for the pre-refinement artwork) —
// the extra line spacing and larger lettering widened the bounding box.
const K3C_LOGO_CROPS = {
  // Navy lettering + full colour mosaic — for light/white backgrounds.
  coloured: { x: 3741.54, y: 8325.53, w: 10350.24, h: 4667.32 },
  // White lettering + full colour mosaic — for navy/dark backgrounds.
  whiteText: { x: 2579.6, y: 2899.4, w: 10330.25, h: 4667.31 },
};

function K3CLogo({ crop, src, alt, className = "" }) {
  const innerWidthPct = (CANVAS_WIDTH / crop.w) * 100;
  const innerHeightPct = (CANVAS_HEIGHT / crop.h) * 100;
  const leftPct = -(crop.x / crop.w) * 100;
  const topPct = -(crop.y / crop.h) * 100;

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden align-middle ${className}`}
      style={{ aspectRatio: `${crop.w} / ${crop.h}` }}
    >
      <img
        src={src}
        alt={alt}
        className="absolute max-w-none"
        style={{
          width: `${innerWidthPct}%`,
          height: `${innerHeightPct}%`,
          left: `${leftPct}%`,
          top: `${topPct}%`,
        }}
      />
    </span>
  );
}

export function K3CColouredLogo({ className = "", alt = "K3C" }) {
  return (
    <K3CLogo
      crop={K3C_LOGO_CROPS.coloured}
      src="/logos/k3c-coloured-logo.svg"
      alt={alt}
      className={className}
    />
  );
}

export function K3CWhiteTextLogo({ className = "", alt = "K3C" }) {
  return (
    <K3CLogo
      crop={K3C_LOGO_CROPS.whiteText}
      src="/logos/k3c-logo-white-text.svg"
      alt={alt}
      className={className}
    />
  );
}
