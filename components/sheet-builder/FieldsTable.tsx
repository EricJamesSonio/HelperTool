import { Table } from "@/components/ui/Table";
import FieldRow from "./FieldRow";
import type { FormField } from "@/lib/formConfig";

const TABLE_HEADERS = ["", "Label", "Key", "Type", "Required", "Options", "Style", ""];

interface Props {
  fields: FormField[];
  onChange: (id: string, patch: Partial<FormField>) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
}

export default function FieldsTable({ fields, onChange, onMove, onRemove }: Props) {
  return (
    <Table headers={TABLE_HEADERS} showColumnTicks={false} isEmpty={fields.length === 0} emptyMessage="No fields yet — add one below.">
      {fields.map((field, i) => (
        <FieldRow
          key={field.id}
          field={field}
          index={i}
          isFirst={i === 0}
          isLast={i === fields.length - 1}
          onChange={onChange}
          onMove={onMove}
          onRemove={onRemove}
        />
      ))}
    </Table>
  );
}