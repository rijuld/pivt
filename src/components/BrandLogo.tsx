import Image from "next/image";

/** Intrinsic dimensions of public/pivt-logo.png */
const SRC_W = 790;
const SRC_H = 316;

type BrandLogoProps = {
  className?: string;
  /** Display height in CSS pixels; width scales to preserve aspect ratio. Ignored when `fullWidth`. */
  height?: number;
  /**
   * Span the full width of the container; intrinsic aspect ratio preserved (`w-full h-auto`).
   */
  fullWidth?: boolean;
  /** Optional max height (Tailwind) so the block doesn’t dominate very wide sidebars. */
  fullWidthMaxHeightClassName?: string;
  priority?: boolean;
};

export function BrandLogo({
  className,
  height = 28,
  fullWidth,
  fullWidthMaxHeightClassName = "max-h-[112px] sm:max-h-[128px]",
  priority,
}: BrandLogoProps) {
  const imgClass = ["brightness-0 invert", className].filter(Boolean).join(" ");

  if (fullWidth) {
    return (
      <Image
        src="/pivt-logo.png"
        alt="Pivt"
        width={SRC_W}
        height={SRC_H}
        className={[
          "block h-auto w-full max-w-full object-contain object-left",
          fullWidthMaxHeightClassName,
          imgClass,
        ]
          .filter(Boolean)
          .join(" ")}
        sizes="(max-width: 380px) min(356px, 28vw), 360px"
        priority={priority}
      />
    );
  }

  const width = Math.round((SRC_W / SRC_H) * height);
  return (
    <Image
      src="/pivt-logo.png"
      alt="Pivt"
      width={width}
      height={height}
      className={imgClass}
      priority={priority}
    />
  );
}
