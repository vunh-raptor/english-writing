import { cn } from "@/lib/utils";

/**
 * Standard page shell used by every main screen: centers content, applies
 * responsive padding that opens up on desktop, and fades the screen in on mount.
 * `width="wide"` is for dashboard-style screens (Progress, Trending).
 */
export function PageContainer({
  children,
  className,
  width = "default",
}: {
  children: React.ReactNode;
  className?: string;
  width?: "default" | "wide" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full animate-fade-in px-5 py-8 sm:px-6 lg:px-10 lg:py-12",
        width === "narrow" && "max-w-xl",
        width === "default" && "max-w-3xl",
        width === "wide" && "max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
