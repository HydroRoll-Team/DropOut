import {
  Folder,
  Home,
  LogOutIcon,
  PlusIcon,
  Settings,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { UserAvatar } from "./user-avatar";

interface NavItemProps {
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  to: string;
}

function NavItem({ Icon, label, to }: NavItemProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-fit lg:w-full justify-center lg:justify-start",
        isActive && "relative bg-accent",
      )}
      size="lg"
      onClick={() => navigate(to)}
    >
      <Icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
      <span className="hidden lg:block text-sm relative z-10">{label}</span>
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-black dark:bg-white rounded-r-full hidden lg:block"></div>
      )}
    </Button>
  );
}

export function Sidebar() {
  const authStore = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const renderUserAvatar = () => {
    return (
      <div className="w-full flex flex-col items-center hover:bg-accent/90 transition-colors cursor-pointer">
        <div className="lg:hidden">
          <UserAvatar />
        </div>
        <div className="w-full hidden lg:flex bg-accent/90 p-3 flex-row space-x-3">
          <UserAvatar />
          <div className="">
            <p className="text-sm font-medium text-white">
              {authStore.account?.username}
            </p>
            <p className="text-xs text-zinc-400">
              {authStore.account?.type === "microsoft"
                ? t("common.online")
                : t("common.offline")}
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "flex flex-col items-center lg:items-start",
        "bg-sidebar transition-all duration-300",
        "w-20 lg:w-64 shrink-0 pt-6 pb-6 lg:pb-3 h-full",
      )}
    >
      {/* Logo Area */}
      <div className="h-16 w-full flex items-center justify-center lg:justify-start lg:px-6 mb-6">
        {/* Icon Logo (Small) */}
        <div className="lg:hidden text-black dark:text-white">
          <svg
            width="32"
            height="32"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <title>Logo</title>
            <path
              d="M25 25 L50 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M25 75 L50 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M50 50 L75 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <circle cx="25" cy="25" r="8" fill="currentColor" stroke="none" />
            <circle cx="25" cy="50" r="8" fill="currentColor" stroke="none" />
            <circle cx="25" cy="75" r="8" fill="currentColor" stroke="none" />
            <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" />
            <circle cx="75" cy="50" r="8" fill="currentColor" stroke="none" />
          </svg>
        </div>
        {/* Full Logo (Large) */}
        <div className="hidden lg:flex items-center gap-3 font-bold text-xl tracking-tighter dark:text-white text-black">
          <svg
            width="42"
            height="42"
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <title>Logo</title>
            <path
              d="M25 25 L50 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M25 75 L50 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M50 50 L75 50"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
            />

            <circle cx="25" cy="25" r="8" fill="currentColor" stroke="none" />
            <circle cx="25" cy="50" r="8" fill="currentColor" stroke="none" />
            <circle cx="25" cy="75" r="8" fill="currentColor" stroke="none" />

            <circle
              cx="50"
              cy="25"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 2"
              fill="none"
              className="opacity-30"
            />
            <circle
              cx="50"
              cy="75"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 2"
              fill="none"
              className="opacity-30"
            />
            <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" />
            <circle cx="75" cy="50" r="8" fill="currentColor" stroke="none" />
          </svg>

          <span>DROPOUT</span>
        </div>
      </div>

      <nav
        className="w-full flex flex-col space-y-1 px-3 items-center"
        data-tour="sidebar-nav"
      >
        <NavItem Icon={Home} label={t("nav.overview")} to="/" />
        <NavItem Icon={Folder} label={t("nav.instances")} to="/instances" />
        <NavItem Icon={Settings} label={t("nav.settings")} to="/settings" />
      </nav>

      <div
        className="w-full lg:px-3 flex-1 flex flex-col justify-end"
        data-tour="sidebar-account"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={renderUserAvatar()}
            nativeButton={false}
            className="w-full"
          >
            Open
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={20}>
            {authStore.accounts.length > 1 && (
              <>
                <DropdownMenuLabel>Accounts</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {authStore.accounts
                    .filter((a) => !a.isActive)
                    .map((a) => (
                      <DropdownMenuItem
                        key={a.uuid}
                        onClick={() => authStore.switchAccount(a.uuid)}
                      >
                        <UserIcon className="size-4" />
                        <span className="truncate">{a.username}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {a.accountType === "microsoft" ? "MS" : "Offline"}
                        </span>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => navigate("/")}>
                <PlusIcon className="size-4" />
                {t("account.addAccount")}
              </DropdownMenuItem>
              {authStore.accounts.length > 1 && (
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    const active = authStore.accounts.find((a) => a.isActive);
                    if (active) authStore.removeAccount(active.uuid);
                  }}
                >
                  <Trash2Icon className="size-4" />
                  {t("account.removeCurrent")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                variant="destructive"
                onClick={authStore.logout}
              >
                <LogOutIcon />
                {t("common.logout")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
