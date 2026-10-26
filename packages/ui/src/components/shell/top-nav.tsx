import {
  CopyIcon,
  LogOutIcon,
  MinusIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router";
import { LoginModal } from "@/components/login-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/user-avatar";
import {
  onTitlebarMouseDown,
  useMaximized,
  windowActions,
} from "@/lib/desktop-window";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { LogoMark, Wordmark } from "./logo";

const NAV = [
  { to: "/", key: "nav.overview", index: "01" },
  { to: "/instances", key: "nav.instances", index: "02" },
  { to: "/assistant", key: "nav.assistant", index: "03" },
  { to: "/settings", key: "nav.settings", index: "04" },
] as const;

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

const tagButton =
  "tag cursor-pointer text-[15px] outline-none transition-[transform,box-shadow] duration-100 hover:-translate-y-px hover:shadow-[0_2px_0_0_var(--rule)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/*
 * 顶栏：几张白标签贴在纸面最上沿（jev 的导航）。
 * 左边是标志，中间是四个页面，当前页反成黑底；右边是账号。
 */
export function TopNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const account = useAuthStore((state) => state.account);
  const accounts = useAuthStore((state) => state.accounts);
  const switchAccount = useAuthStore((state) => state.switchAccount);
  const removeAccount = useAuthStore((state) => state.removeAccount);
  const logout = useAuthStore((state) => state.logout);
  const [showLogin, setShowLogin] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 标题栏空白处是窗口拖动区，键盘用户不需要拖窗口
    <header
      className="relative z-30 col-span-2 flex items-start justify-between gap-3 pl-[18px]"
      onMouseDown={onTitlebarMouseDown}
    >
      <button
        type="button"
        className={cn(tagButton, "gap-1.5 pr-2")}
        onClick={() => navigate("/")}
        aria-label="DropOut"
      >
        <LogoMark />
        <Wordmark className="text-[15px]" />
      </button>

      <nav
        aria-label={t("shell.primaryNav")}
        className="flex items-start gap-1"
        data-tour="sidebar-nav"
      >
        {NAV.map((item) => {
          const active = isActive(location.pathname, item.to);
          const label = t(item.key);
          return (
            <button
              key={item.to}
              type="button"
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(tagButton, active && "tag-ink")}
              onClick={() => navigate(item.to)}
            >
              <span
                aria-hidden="true"
                className="type-pixel -mt-1.5 self-start text-[10px] opacity-60"
              >
                {item.index}
              </span>
              <span>{label}</span>
              {active && (
                <span
                  aria-hidden="true"
                  className="ml-0.5 size-1.5 bg-signal"
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex items-start gap-1" data-tour="sidebar-account">
        {account ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(tagButton, "gap-1.5 pl-1")}
              aria-label={t("nav.accounts")}
            >
              <UserAvatar className="size-4" />
              <span className="max-w-32 truncate">{account.username}</span>
              <span
                className={cn(
                  "chip ml-0.5",
                  account.type === "microsoft" ? "chip-go" : "chip-ghost",
                )}
              >
                {account.type === "microsoft"
                  ? t("common.online")
                  : t("common.offline")}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-56">
              {accounts.length > 1 && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{t("shell.accounts")}</DropdownMenuLabel>
                    {accounts
                      .filter((item) => !item.isActive)
                      .map((item) => (
                        <DropdownMenuItem
                          key={item.uuid}
                          onClick={() => switchAccount(item.uuid)}
                        >
                          <UserIcon className="size-4" />
                          <span className="truncate">{item.username}</span>
                          <span className="type-pixel ml-auto text-[10px] opacity-70">
                            {item.accountType === "microsoft" ? "MS" : "OFF"}
                          </span>
                        </DropdownMenuItem>
                      ))}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setShowLogin(true)}>
                  <PlusIcon className="size-4" />
                  {t("account.addAccount")}
                </DropdownMenuItem>
                {accounts.length > 1 && (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      const active = accounts.find((item) => item.isActive);
                      if (active) removeAccount(active.uuid);
                    }}
                  >
                    <Trash2Icon className="size-4" />
                    {t("account.removeCurrent")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={logout}>
                  <LogOutIcon />
                  {t("common.logout")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            className={cn(tagButton, "tag-ink")}
            onClick={() => setShowLogin(true)}
          >
            <UserIcon className="size-3.5" aria-hidden="true" />
            {t("common.login")}
          </button>
        )}
        <WindowControls />
      </div>

      <LoginModal open={showLogin} onOpenChange={setShowLogin} />
    </header>
  );
}

const controlButton =
  "flex h-[23px] w-[26px] cursor-pointer items-center justify-center bg-sheet text-ink outline-none transition-colors hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-3.5";

/* 自绘的窗口按钮：贴在顶栏最右边的三张小标签 */
function WindowControls() {
  const { t } = useTranslation();
  const maximized = useMaximized();

  return (
    <div className="ml-2 flex items-start gap-px">
      <button
        type="button"
        className={controlButton}
        aria-label={t("shell.minimize")}
        onClick={() => void windowActions.minimize()}
      >
        <MinusIcon strokeWidth={2.5} />
      </button>
      <button
        type="button"
        className={controlButton}
        aria-label={maximized ? t("shell.restore") : t("shell.maximize")}
        onClick={() => void windowActions.toggleMaximize()}
      >
        {maximized ? (
          <CopyIcon strokeWidth={2.25} />
        ) : (
          <SquareIcon strokeWidth={2.5} />
        )}
      </button>
      <button
        type="button"
        className={cn(
          controlButton,
          "bg-ink text-paper hover:bg-fault hover:text-white",
        )}
        aria-label={t("shell.closeWindow")}
        onClick={() => void windowActions.close()}
      >
        <XIcon strokeWidth={2.5} />
      </button>
    </div>
  );
}
