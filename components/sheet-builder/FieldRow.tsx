"use client";

import Button from "@/components/ui/Button";
import { Td, Tr } from "@/components/ui/Table";
import HeaderStylePopover from "./HeaderStylePopover";
import type { FormField, FieldType } from "@/lib/formConfig";
import styles from "./FieldRow.module.css";

const FIELD_TYPES: FieldType[] = ["text", "email", "number", "tel", "date", "textarea", "select"];

function slugify(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

interface Props {
  field: FormField;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (id: string, patch: Partial<FormField>) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}

export default function FieldRow({ field, index, isFirst, isLast, onChange, onMove, onRemove }: Props) {
  function handleLabelChange(label: string) {
    const autoKey = field.key === "" || field.key === slugify(field.label);
    onChange(field.id, { label, key: autoKey ? slugify(label) : field.key });
  }

  return (
    <Tr>
      <Td>
        <Button variant="ghost" size="sm" onClick={() => onMove(index, -1)} disabled={isFirst}>↑</Button>
        <Button variant="ghost" size="sm" onClick={() => onMove(index, 1)} disabled={isLast}>↓</Button>
      </Td>
      <Td>
        <input className={styles.cell} value={field.label} onChange={(e) => handleLabelChange(e.target.value)} placeholder="e.g. Name" />
      </Td>
      <Td>
        <input className={styles.cell} value={field.key} onChange={(e) => onChange(field.id, { key: slugify(e.target.value) })} placeholder="e.g. name" />
      </Td>
      <Td>
        <select value={field.type} onChange={(e) => onChange(field.id, { type: e.target.value as FieldType })}>
          {FIELD_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </Td>
      <Td style={{ textAlign: "center" }}>
        <input type="checkbox" checked={field.required} onChange={(e) => onChange(field.id, { required: e.target.checked })} />
      </Td>
      <Td>
        {field.type === "select" && (
          <input className={styles.cell} value={field.options || ""} onChange={(e) => onChange(field.id, { options: e.target.value })} placeholder="Small, Medium, Large" />
        )}
      </Td>
      <Td>
        <HeaderStylePopover
          color={field.headerColor}
          align={field.headerAlign}
          onChange={(patch) => onChange(field.id, patch)}
        />
      </Td>
      <Td>
        <Button variant="ghost" size="sm" onClick={() => onRemove(field.id)}>✕</Button>
      </Td>
    </Tr>
  );
}