import { cn } from "@/lib/utils";

/**
 * Przyciski akcji rejestru. Legacy trzyma je w jednym pasku pod podglądem umowy
 * (audyt 1.5), więc warianty odpowiadają tamtej hierarchii: jedna akcja główna,
 * reszta neutralna, usuwanie osobno i w tonie ostrzegawczym.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border bg-card hover:bg-muted",
  ghost: "hover:bg-muted",
  danger: "border border-red-600/30 bg-red-50 text-red-700 hover:bg-red-100",
};

const SIZE: Record<ButtonSize, string> = {
  // min-h-9 — cel dotykowy nie schodzi poniżej ~44px razem z odstępami paska akcji.
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-10 px-4 py-2 text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "sm",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
