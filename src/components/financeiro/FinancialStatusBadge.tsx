type Tone =
  | "gray"
  | "blue"
  | "yellow"
  | "green"
  | "red";

const classes: Record<Tone, string> = {
  gray:
    "bg-gray-100 text-gray-700 border-gray-200",

  blue:
    "bg-blue-50 text-blue-700 border-blue-200",

  yellow:
    "bg-yellow-50 text-yellow-800 border-yellow-200",

  green:
    "bg-green-50 text-green-700 border-green-200",

  red:
    "bg-red-50 text-red-700 border-red-200",
};

export default function FinancialStatusBadge({
  label,
  tone = "gray",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={[
        "inline-flex items-center",
        "rounded-full border",
        "px-2.5 py-1",
        "text-xs font-medium",
        classes[tone],
      ].join(" ")}
    >
      {label}
    </span>
  );
}