import { K3CColouredLogo, K3CWhiteTextLogo } from "./K3CLogo";

export default function OfficialLogo({
  variant = "light",
  className = "",
  compact = false,
}) {
  const heightClass = compact ? "h-12" : "h-14 md:h-16";
  const combinedClassName = `${heightClass} ${className}`;

  return variant === "dark" ? (
    <K3CColouredLogo className={combinedClassName} />
  ) : (
    <K3CWhiteTextLogo className={combinedClassName} />
  );
}
