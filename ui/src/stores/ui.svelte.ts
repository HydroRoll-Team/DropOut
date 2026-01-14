import { type ViewType } from "../types";

export class UIState {
  currentView: ViewType = $state("home");
  status = $state("Ready");
  showConsole = $state(false);
  appVersion = $state("...");

  private statusTimeout: ReturnType<typeof setTimeout> | null = null;

  setStatus(msg: string) {
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    
    this.status = msg;
    
    if (msg !== "Ready") {
      this.statusTimeout = setTimeout(() => {
        this.status = "Ready";
      }, 5000);
    }
  }

  toggleConsole() {
    this.showConsole = !this.showConsole;
  }

  setView(view: ViewType) {
    this.currentView = view;
  }
}

export const uiState = new UIState();
