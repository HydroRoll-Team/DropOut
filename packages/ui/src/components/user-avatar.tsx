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

  return (
    <Avatar {...props}>
      <AvatarImage
        src={`https://minotar.net/helm/${authStore.account.username}/100.png`}
      />
      <AvatarFallback>{authStore.account.username.slice(0, 2)}</AvatarFallback>
      <AvatarBadge />
    </Avatar>
  );
}
