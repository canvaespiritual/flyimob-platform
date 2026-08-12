"use client";

import {
  ChangeEvent,
  InputHTMLAttributes,
} from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> & {
  onChange?: (
    event: ChangeEvent<HTMLInputElement>
  ) => void;
};

export default function MoneyInput({
  className = "",
  ...props
}: Props) {
  return (
    <div className="relative">
      <span
        className="
          absolute
          left-3
          top-1/2
          -translate-y-1/2
          text-sm
          text-gray-500
          pointer-events-none
        "
      >
        R$
      </span>

      <input
        {...props}
        type="text"
        inputMode="decimal"
        className={[
          "w-full",
          "rounded-md",
          "border",
          "border-gray-300",
          "bg-white",
          "py-2",
          "pl-10",
          "pr-3",
          "text-sm",
          "text-gray-900",
          "outline-none",
          "focus:border-gray-500",
          className,
        ].join(" ")}
      />
    </div>
  );
}