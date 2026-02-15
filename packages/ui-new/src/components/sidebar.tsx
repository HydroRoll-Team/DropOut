import { Bot, Folder, Home, Package, Settings } from "lucide-react";
import { Link, useLocation } from "react-router";
import { useUIStore, type ViewType } from "../stores/ui-store";

interface NavItemProps {
  view: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  to: string;
}

function NavItem({ view, Icon, label, to }: NavItemProps) {
  const uiStore = useUIStore();
  const location = useLocation();
  const isActive = location.pathname === to || uiStore.currentView === view;

  const handleClick = () => {
    uiStore.setView(view as ViewType);
  };

  return (
    <Link to={to}>
      <button
        type="button"
        className={`group flex items-center lg:gap-3 justify-center lg:justify-start w-full px-0 lg:px-4 py-2.5 rounded-sm transition-all duration-200 relative ${
          isActive
            ? "bg-black/5 dark:bg-white/10 dark:text-white text-black font-medium"
            : "dark:text-zinc-400 text-zinc-500 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5"
        }`}
        onClick={handleClick}
      >
        <Icon className="size-5" strokeWidth={isActive ? 2.5 : 2} />
        <span className="hidden lg:block text-sm relative z-10">{label}</span>

        {/* Active Indicator */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-black dark:bg-white rounded-r-full hidden lg:block"></div>
        )}
      </button>
    </Link>
  );
}

export function Sidebar() {
  const uiStore = useUIStore();

  return (
    <aside className="w-20 lg:w-64 dark:bg-[#09090b] bg-white border-r dark:border-white/10 border-gray-200 flex flex-col items-center lg:items-start transition-all duration-300 shrink-0 py-6 z-20">
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

      {/* Navigation */}
      <nav className="flex-1 w-full flex flex-col gap-1 px-3">
        <NavItem view="home" Icon={Home} label="Overview" to="/" />
        <NavItem
          view="instances"
          Icon={Folder}
          label="Instances"
          to="/instances"
        />
        <NavItem
          view="versions"
          Icon={Package}
          label="Versions"
          to="/versions"
        />
        <NavItem view="guide" Icon={Bot} label="Assistant" to="/guide" />
        <NavItem
          view="settings"
          Icon={Settings}
          label="Settings"
          to="/settings"
        />
      </nav>

      {/* Footer Info */}
      <div className="p-4 w-full flex justify-center lg:justify-start lg:px-6 opacity-40 hover:opacity-100 transition-opacity">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          v{uiStore.appVersion}
        </div>
      </div>
    </aside>
  );
}
