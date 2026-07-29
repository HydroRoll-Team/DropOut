import { useNavigate } from "react-router";
import { ImportWizard } from "@/components/import-wizard";
import { useInstanceStore } from "@/models/instance";

export function ImportInstancesPage() {
  const navigate = useNavigate();
  const refreshInstances = useInstanceStore((state) => state.refresh);

  return (
    <div className="size-full">
      <ImportWizard
        open
        onOpenChange={(open) => {
          if (!open) navigate("/instances");
        }}
        onComplete={() => refreshInstances()}
      />
    </div>
  );
}
