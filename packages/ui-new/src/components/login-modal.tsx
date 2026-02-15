import { Mail, User } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function LoginModal() {
  const authStore = useAuthStore();

  const handleOfflineLogin = () => {
    if (authStore.offlineUsername.trim()) {
      authStore.performOfflineLogin();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleOfflineLogin();
    }
  };

  if (!authStore.isLoginModalOpen) return null;

  return (
    <div className="fixed inset-0 z-200 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Login</h3>
            <button
              type="button"
              onClick={() => {
                authStore.setLoginMode("select");
                authStore.setOfflineUsername("");
                authStore.cancelMicrosoftLogin();
              }}
              className="text-zinc-400 hover:text-white transition-colors p-1"
            >
              ×
            </button>
          </div>

          {/* Content based on mode */}
          {authStore.loginMode === "select" && (
            <div className="space-y-4">
              <p className="text-zinc-400 text-sm">
                Choose your preferred login method
              </p>
              <button
                type="button"
                onClick={() => authStore.startMicrosoftLogin()}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
              >
                <Mail size={18} />
                <span className="font-medium">Microsoft Account</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  authStore.loginMode = "offline";
                }}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
              >
                <User size={18} />
                <span className="font-medium">Offline Mode</span>
              </button>
            </div>
          )}

          {authStore.loginMode === "offline" && (
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-medium text-zinc-300 mb-2"
                >
                  Username
                </label>
                <input
                  name="username"
                  type="text"
                  value={authStore.offlineUsername}
                  onChange={(e) => authStore.setOfflineUsername(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                  placeholder="Enter your Minecraft username"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    authStore.loginMode = "select";
                    authStore.setOfflineUsername("");
                  }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleOfflineLogin}
                  disabled={!authStore.offlineUsername.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Login
                </button>
              </div>
            </div>
          )}

          {authStore.loginMode === "microsoft" && (
            <div className="space-y-4">
              {authStore.deviceCodeData && (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                  <div className="text-center mb-4">
                    <div className="text-xs font-mono bg-zinc-900 px-3 py-2 rounded border border-zinc-700 mb-3">
                      {authStore.deviceCodeData.userCode}
                    </div>
                    <p className="text-zinc-300 text-sm font-medium">
                      Your verification code
                    </p>
                  </div>
                  <p className="text-zinc-400 text-sm text-center">
                    Visit{" "}
                    <a
                      href={authStore.deviceCodeData.verificationUri}
                      target="_blank"
                      className="text-indigo-400 hover:text-indigo-300 font-medium"
                    >
                      {authStore.deviceCodeData.verificationUri}
                    </a>{" "}
                    and enter the code above
                  </p>
                </div>
              )}
              <div className="text-center">
                <p className="text-zinc-300 text-sm mb-2">
                  {authStore.msLoginStatus}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    authStore.cancelMicrosoftLogin();
                    authStore.setLoginMode("select");
                  }}
                  className="text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
