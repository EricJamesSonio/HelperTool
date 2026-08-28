import styles from "./TargetSheetField.module.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function TargetSheetField({ value, onChange }: Props) {
  return (
    <div className={styles.field}>
      <label>Target sheet tab name</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}