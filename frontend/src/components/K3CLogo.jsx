// Official K3C logo marks. Each display SVG is a byte-for-byte copy of the
// approved artwork with only its root viewBox/width/height adjusted to
// crop out the master canvas's large empty margins — no shape, path or
// colour was added, removed or redrawn. The untouched originals are kept
// alongside as k3c-*-original.svg. See K3C_LOGO_VIEWBOX_NOTES below for
// the exact crop math.
//
// K3C_LOGO_VIEWBOX_NOTES:
// - k3c-coloured-logo.svg (navy lettering, for light/white backgrounds):
//   original viewBox "0 0 17000 25000" -> cropped to the navy-text
//   instance's measured bounding box (x=3741.54 y=8325.53 w=9533.80
//   h=4667.32) plus 8% padding per side.
// - k3c-logo-white-text.svg (white lettering, for navy/dark backgrounds):
//   original viewBox "0 0 17000 25000" -> cropped to the white-text
//   instance's measured bounding box (x=2579.60 y=2899.40 w=9513.80
//   h=4667.31) plus 8% padding per side.
// Both files' root width/height attributes were updated to match the new
// viewBox so the browser reports the correct (now landscape, ~2.04:1)
// natural aspect ratio when used as a plain <img>.
export function K3CColouredLogo({ className = "", alt = "K3C" }) {
  return (
    <img
      src="/logos/k3c-coloured-logo.svg"
      alt={alt}
      className={`w-auto shrink-0 object-contain ${className}`}
    />
  );
}

export function K3CWhiteTextLogo({ className = "", alt = "K3C" }) {
  return (
    <img
      src="/logos/k3c-logo-white-text.svg"
      alt={alt}
      className={`w-auto shrink-0 object-contain ${className}`}
    />
  );
}
