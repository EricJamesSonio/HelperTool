"use client";

import { useRef, useState } from "react";
import { AlignLeft, AlignCenter, AlignRight, Palette } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import type { HeaderAlign } from "@/lib/formConfig";
import styles from "./HeaderStylePopover.module.css";

const SWATCHES = ["", "#1f6f5c", "#b3261e", "#9a6300", "#3c3f42", "#7f77dd", "#d85a30"];

interface Props {
  color?: string;
  align?: HeaderAlign;
  onChange: (patch: { headerColor?: string; headerAlign?: HeaderAlign }) => void;
}

export default function HeaderStylePopover({ color = "", align = "LEFT", onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.trigger} onClick={() => setOpen((o) => !o)} title="Header style">
        <span className={styles.swatch} style={{ background: color || "var(--surface-sunken)" }} />
        <Palette size={14} />
      </button>

      {open && (
        <div className={styles.panel}>
          <p className={styles.label}>Background</p>
          <div className={styles.swatchRow}>
            {SWATCHES.map((c) => (
              <button
                key={c || "none"}
                type="button"
                className={`${styles.swatchBtn} ${color === c ? styles.swatchBtnActive : ""}`}
                style={{ background: c || "var(--surface)" }}
                onClick={() => onChange({ headerColor: c })}
                title={c || "Default"}
              />
            ))}
            <input
              type="color"
              value={color || "#ffffff"}
              onChange={(e) => onChange({ headerColor: e.target.value })}
              className={styles.colorInput}
              title="Custom color"
            />
          </div>

          <p className={styles.label}>Alignment</p>
          <div className={styles.alignRow}>
            <button type="button" className={`${styles.alignBtn} ${align === "LEFT" ? styles.alignBtnActive : ""}`} onClick={() => onChange({ headerAlign: "LEFT" })}>
              <AlignLeft size={15} />
            </button>
            <button type="button" className={`${styles.alignBtn} ${align === "CENTER" ? styles.alignBtnActive : ""}`} onClick={() => onChange({ headerAlign: "CENTER" })}>
              <AlignCenter size={15} />
            </button>
            <button type="button" className={`${styles.alignBtn} ${align === "RIGHT" ? styles.alignBtnActive : ""}`} onClick={() => onChange({ headerAlign: "RIGHT" })}>
              <AlignRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}