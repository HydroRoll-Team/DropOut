import { Folder, Home, LogOutIcon, Settings } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/models/auth";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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

  const handleClick = () => {
    navigate(to);
  };

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-fit lg:w-full justify-center lg:justify-start",
        isActive && "relative bg-accent",
      )}
      size="lg"
      onClick={handleClick}
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

  return (
    <aside
      className={cn(
        "flex flex-col items-center lg:items-start",
        "bg-sidebar transition-all duration-300",
        "w-20 lg:w-64 shrink-0 py-6 h-full",
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

      <nav className="w-full flex flex-col space-y-1 px-3 items-center">
        <NavItem Icon={Home} label="Overview" to="/" />
        <NavItem Icon={Folder} label="Instances" to="/instances" />
        <NavItem Icon={Settings} label="Settings" to="/settings" />
      </nav>

      <div className="flex-1 flex flex-col justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger render={<UserAvatar />}>
            Open
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={20}>
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={authStore.logout}
              >
                <LogOutIcon />
                Logout
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
