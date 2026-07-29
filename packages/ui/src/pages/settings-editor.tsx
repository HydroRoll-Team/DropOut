import { useNavigate } from "react-router";
import { ConfigEditor } from "@/components/config-editor";

export function SettingsEditorPage() {
  const navigate = useNavigate();

  return (
    <div className="size-full">
      <ConfigEditor
        open
        onOpenChange={(open) => {
          if (!open) navigate("/settings");
        }}
      />
    </div>
  );
}
