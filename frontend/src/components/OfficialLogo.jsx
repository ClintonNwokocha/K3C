export default function OfficialLogo({
  variant = "light",
  className = "",
  compact = false,
}) {
  const logoSrc =
    variant === "dark"
      ? "/logos/k3c-logo-colour.png"
      : "/logos/k3c-logo-white-text.png";

  return (
    <img
      src={logoSrc}
      alt="K3C"
      className={`block w-auto object-contain ${
        compact ? "h-12" : "h-14 md:h-16"
      } ${className}`}
    />
  );
}
