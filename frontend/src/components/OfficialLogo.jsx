import { K3CColouredLogo, K3CWhiteTextLogo } from "./K3CLogo";

export default function OfficialLogo({
  variant = "light",
  className = "",
  compact = false,
}) {
  const heightClass = compact ? "h-16 md:h-20" : "h-20 md:h-24 lg:h-[104px]";
  const combinedClassName = `${heightClass} ${className}`;

  return variant === "dark" ? (
    <K3CColouredLogo className={combinedClassName} />
  ) : (
    <K3CWhiteTextLogo className={combinedClassName} />
  );
}
