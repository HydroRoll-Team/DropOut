import { Play, User, XIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { useGameStore } from "@/models/game";
import { useInstanceStore } from "@/models/instance";
import { LoginModal } from "./login-modal";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Spinner } from "./ui/spinner";

export function BottomBar() {
  const account = useAuthStore((state) => state.account);

  const { instances, activeInstance, setActiveInstance } = useInstanceStore();
  const {
    runningInstanceId,
    launchingInstanceId,
    stoppingInstanceId,
    startGame,
    stopGame,
  } = useGameStore();

  const [showLoginModal, setShowLoginModal] = useState(false);

  const handleInstanceChange = useCallback(
    async (instanceId: string) => {
      if (activeInstance?.id === instanceId) {
        return;
      }

      const nextInstance = instances.find(
        (instance) => instance.id === instanceId,
      );
      if (!nextInstance) {
        return;
      }

      try {
        await setActiveInstance(nextInstance);
      } catch (error) {
        console.error("Failed to activate instance:", error);
        toast.error(`Failed to activate instance: ${String(error)}`);
      }
    },
    [activeInstance?.id, instances, setActiveInstance],
  );

  const handleStartGame = async () => {
    if (!activeInstance) {
      toast.info("Please select an instance first!");
      return;
    }

    await startGame(activeInstance.id, activeInstance.versionId ?? "");
  };

  const handleStopGame = async () => {
    await stopGame(runningInstanceId);
  };

  const renderButton = () => {
    const isGameRunning = runningInstanceId !== null;

    if (!account) {
      return (
        <Button
          className="px-4 py-2"
          size="lg"
          onClick={() => setShowLoginModal(true)}
        >
          <User /> Login
        </Button>
      );
    }

    if (isGameRunning) {
      return (
        <Button
          variant="destructive"
          onClick={handleStopGame}
          disabled={stoppingInstanceId !== null}
        >
          {stoppingInstanceId ? <Spinner /> : <XIcon />}
          Close
        </Button>
      );
    }

    return (
      <Button
        className={cn(
          "px-4 py-2 shadow-xl",
          "bg-emerald-600! hover:bg-emerald-500!",
        )}
        size="lg"
        onClick={handleStartGame}
        disabled={launchingInstanceId === activeInstance?.id}
      >
        {launchingInstanceId === activeInstance?.id ? <Spinner /> : <Play />}
        Start
      </Button>
    );
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/30 via-transparent to-transparent p-4 z-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between bg-white/5 dark:bg-black/20 backdrop-blur-xl border border-white/10 dark:border-white/5 p-3 shadow-lg">
          <div className="flex items-center gap-4 min-w-0">
            <Select
              value={activeInstance?.id ?? null}
              items={instances.map((instance) => ({
                label: instance.name,
                value: instance.id,
              }))}
              onValueChange={(value) => {
                if (value) {
                  void handleInstanceChange(value);
                }
              }}
              disabled={instances.length === 0}
            >
              <SelectTrigger className="w-full min-w-64 max-w-80">
                <SelectValue
                  placeholder={
                    instances.length === 0
                      ? "No instances available"
                      : "Please select an instance"
                  }
                />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {instances.map((instance) => (
                    <SelectItem key={instance.id} value={instance.id}>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{instance.name}</span>
                        <span className="text-muted-foreground truncate text-[11px]">
                          {instance.versionId ?? "No version selected"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-3">{renderButton()}</div>
        </div>
      </div>

      <LoginModal
        open={showLoginModal}
        onOpenChange={() => setShowLoginModal(false)}
      />
    </div>
  );
}
