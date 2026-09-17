export default function OfficialLogo({
  variant = "light",
  className = "",
  compact = false,
}) {
  const logoSrc =
    variant === "dark"
      ? "/logos/kccc-logo-dark.png"
      : "/logos/kccc-logo-light.png";

  return (
    <img
      src={logoSrc}
      alt="Kaduna Climate Command Centre"
      className={`block w-auto object-contain ${
        compact ? "h-12" : "h-14 md:h-16"
      } ${className}`}
    />
  );
}
