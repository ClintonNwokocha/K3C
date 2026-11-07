// Official K3C logo marks, used exactly as supplied — no cropping,
// recolouring or SVG/CSS reconstruction. Each image is the full approved
// file; sizing is done purely via height + object-fit: contain, which
// preserves the file's natural aspect ratio untouched.
export function K3CColouredLogo({ className = "", alt = "K3C" }) {
  return (
    <img
      src="/logos/k3c-logo-white-bg.jpg"
      alt={alt}
      className={`w-auto object-contain ${className}`}
    />
  );
}

export function K3CWhiteTextLogo({ className = "", alt = "K3C" }) {
  return (
    <img
      src="/logos/k3c-logo-navy-bg.jpg"
      alt={alt}
      className={`w-auto object-contain ${className}`}
    />
  );
}
