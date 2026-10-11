"use client";

import { useEffect, useRef } from "react";

type LocalizationOption = { value: string; label: string };

type LocalizationSelectProps = {
  ariaLabel: string;
  options: LocalizationOption[];
  defaultValue: string;
};

/** Footer country/language control sized to its selected text plus a 28px arrow gutter. */
export function LocalizationSelect({ ariaLabel, options, defaultValue }: LocalizationSelectProps) {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const select = selectRef.current;
    if (!select) return;

    const fitSelectToValue = () => {
      const option = select.options[select.selectedIndex];
      if (!option) return;
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
      probe.style.font = getComputedStyle(select).font;
      probe.textContent = option.text;
      document.body.appendChild(probe);
      const valueWidth = probe.offsetWidth;
      probe.remove();
      select.style.setProperty("--select-width", `${valueWidth}px`);
    };

    fitSelectToValue();
    select.addEventListener("change", fitSelectToValue);
    window.addEventListener("resize", fitSelectToValue);

    const fonts = document.fonts;
    if (fonts) {
      void fonts.ready.then(fitSelectToValue).catch(() => {});
    }

    return () => {
      select.removeEventListener("change", fitSelectToValue);
      window.removeEventListener("resize", fitSelectToValue);
    };
  }, []);

  return (
    <select
      ref={selectRef}
      className="localization-switcher__select"
      aria-label={ariaLabel}
      defaultValue={defaultValue}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
