import Button from "@/components/ui/Button";
import styles from "./BuilderActions.module.css";

interface Props {
  saving: boolean;
  executing: boolean;
  disableExecute: boolean;
  showPreview: boolean;
  shareOpen: boolean;
  onSave: () => void;
  onExecute: () => void;
  onTogglePreview: () => void;
  onToggleShare: () => void;
}

export default function BuilderActions({
  saving, executing, disableExecute, showPreview, shareOpen,
  onSave, onExecute, onTogglePreview, onToggleShare,
}: Props) {
  return (
    <div className={styles.row}>
      <Button variant="primary" onClick={onSave} disabled={saving}>
        {saving ? "Saving..." : "Save configuration"}
      </Button>
      <Button variant="danger" onClick={onExecute} disabled={executing || disableExecute}>
        {executing ? "Executing..." : "Execute sheet builder"}
      </Button>
      <Button variant="secondary" onClick={onTogglePreview}>
        {showPreview ? "Hide preview" : "Preview form"}
      </Button>
      <Button variant="secondary" onClick={onToggleShare}>
        {shareOpen ? "Hide share link" : "Share"}
      </Button>
    </div>
  );
}