import { isLauncherFixtureMode } from "@/lib/launcher-runtime";
import { useAuthStore } from "@/models/auth";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "./ui/avatar";

export function UserAvatar({
  className,
  ...props
}: React.ComponentProps<typeof Avatar>) {
  const authStore = useAuthStore();

  if (!authStore.account) {
    return null;
  }

  const fixtureMode = isLauncherFixtureMode();

  return (
    <Avatar className={className} {...props}>
      {!fixtureMode && (
        <AvatarImage
          src={`https://minotar.net/helm/${authStore.account.username}/100.png`}
        />
      )}
      <AvatarFallback>{authStore.account.username.slice(0, 2)}</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  );
}
