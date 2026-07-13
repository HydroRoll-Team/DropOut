import { Mail, User } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useAuthStore } from "@/models/auth";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./ui/field";
import { Input } from "./ui/input";

export interface LoginModalProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Dialog>, "onOpenChange"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ onOpenChange, ...props }: LoginModalProps) {
  const { t } = useI18n();
  const authStore = useAuthStore();

  const [offlineUsername, setOfflineUsername] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const handleMicrosoftLogin = useCallback(async () => {
    setIsLoggingIn(true);
    authStore.setLoginMode("microsoft");
    try {
      await authStore.loginOnline(() => onOpenChange?.(false));
    } catch (error) {
      const err = error as Error;
      console.error("Failed to login with Microsoft:", err);
      setErrorMessage(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  }, [authStore.loginOnline, authStore.setLoginMode, onOpenChange]);

  const handleOfflineLogin = useCallback(async () => {
    setIsLoggingIn(true);
    try {
      await authStore.loginOffline(offlineUsername);
      toast.success(t("login.offlineSuccess"));
      onOpenChange?.(false);
    } catch (error) {
      const err = error as Error;
      console.error("Failed to login offline:", err);
      setErrorMessage(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  }, [authStore, offlineUsername, onOpenChange, t]);

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      <DialogContent className="md:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("login.title")}</DialogTitle>
          <DialogDescription>{t("login.desc")}</DialogDescription>
        </DialogHeader>
        <div className="p-4 w-full overflow-hidden">
          {!authStore.loginMode && (
            <div className="flex flex-col space-y-4">
              <Button size="lg" onClick={handleMicrosoftLogin}>
                <Mail />
                {t("login.microsoft")}
              </Button>
              <Button
                variant="secondary"
                onClick={() => authStore.setLoginMode("offline")}
                size="lg"
              >
                <User />
                {t("login.offline")}
              </Button>
            </div>
          )}
          {authStore.loginMode === "microsoft" && (
            <div className="flex flex-col space-y-4">
              <button
                type="button"
                className="text-4xl font-bold text-center bg-accent p-4 cursor-pointer"
                onClick={() => {
                  if (authStore.deviceCode?.userCode) {
                    navigator.clipboard?.writeText(
                      authStore.deviceCode?.userCode,
                    );
                    toast.success(t("login.copySuccess"));
                  }
                }}
              >
                {authStore.deviceCode?.userCode}
              </button>
              <span className="text-muted-foreground w-full overflow-hidden text-ellipsis">
                {t("login.instructions", {
                  url: authStore.deviceCode?.verificationUri ?? "",
                  code: authStore.deviceCode?.userCode ?? "",
                  seconds: Number(authStore.deviceCode?.expiresIn ?? 0),
                })}{" "}
                <a href={authStore.deviceCode?.verificationUri}>
                  {authStore.deviceCode?.verificationUri}
                </a>{" "}
                <code
                  className="font-semibold cursor-pointer"
                  onClick={() => {
                    if (authStore.deviceCode?.userCode) {
                      navigator.clipboard?.writeText(
                        authStore.deviceCode?.userCode,
                      );
                    }
                  }}
                  onKeyDown={() => {
                    if (authStore.deviceCode?.userCode) {
                      navigator.clipboard?.writeText(
                        authStore.deviceCode?.userCode,
                      );
                    }
                  }}
                >
                  {authStore.deviceCode?.userCode}
                </code>
              </span>
              <FieldError>{errorMessage}</FieldError>
            </div>
          )}
          {authStore.loginMode === "offline" && (
            <FieldGroup>
              <Field>
                <FieldLabel>{t("login.username")}</FieldLabel>
                <FieldDescription>{t("login.usernameDesc")}</FieldDescription>
                <Input
                  value={offlineUsername}
                  onChange={(e) => {
                    setOfflineUsername(e.target.value);
                    setErrorMessage("");
                  }}
                  aria-invalid={!!errorMessage}
                />
                <FieldError>{errorMessage}</FieldError>
              </Field>
            </FieldGroup>
          )}
        </div>
        <DialogFooter>
          <div className="flex flex-col justify-center items-center">
            <span className="text-xs text-muted-foreground ">
              {authStore.statusMessage}
            </span>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              if (authStore.loginMode) {
                if (authStore.loginMode === "microsoft") {
                  authStore.cancelLoginOnline();
                }
                authStore.setLoginMode(null);
              } else {
                onOpenChange?.(false);
              }
            }}
          >
            {t("common.cancel")}
          </Button>
          {authStore.loginMode === "offline" && (
            <Button onClick={handleOfflineLogin} disabled={isLoggingIn}>
              {t("bottom.login")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
