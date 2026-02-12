import React, { useEffect, useState } from "react";
import { api, User } from "./lib/api";
import { AppHeader } from "./components/AppHeader";
import { AuthScreen } from "./components/AuthScreen";
import { LoadingScreen } from "./components/LoadingScreen";
import { FocusView } from "./components/FocusView";
import { HeatmapView } from "./components/HeatmapView";
import { HabitsView } from "./components/HabitsView";
import { Sidebar } from "./components/Sidebar";
import LiquidBackground from "./components/LiquidBackground";


const TABS = ["Focus", "Habits", "Stats"] as const;

type Tab = (typeof TABS)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>("Focus");
  const [status, setStatus] = useState<string>("");
  const [gifName, setGifName] = useState<string>(() => {
    return window.localStorage.getItem("header_gif") || "";
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    try {
      // llama al endpoint /me para verificar si la sesion es valida
      const user = await api.me();
      setCurrentUser(user);
    } catch (err) {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function handleAuthSubmit(event: React.FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    try {
      const user = await api.login(authUsername, authPassword);
      setCurrentUser(user);
    } catch (err) {
      setAuthError((err as Error).message || "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
    }
  }

  function handleGifChange(next: string) {
    setGifName(next);
    if (next) {
      window.localStorage.setItem("header_gif", next);
    } else {
      window.localStorage.removeItem("header_gif");
    }
  }

  if (!authChecked) {
    return (
      <>
        <LiquidBackground />
        <LoadingScreen />
      </>
    );
  }

  if (!currentUser) {
    return (
      <>
        <LiquidBackground />
        <AuthScreen
          username={authUsername}
          password={authPassword}
          error={authError}
          busy={authBusy}
          onUsernameChange={setAuthUsername}
          onPasswordChange={setAuthPassword}
          onSubmit={handleAuthSubmit}
        />
      </>
    );
  }

  return (
    <>
      <LiquidBackground />

      <div className="app-shell">
        <AppHeader
          currentView={tab}
          currentUser={currentUser}
          status={status}
          onLogout={handleLogout}
          onOpenSidebar={() => setSidebarOpen(true)}
          gifName={gifName}
        />

        <Sidebar
          tabs={TABS}
          activeTab={tab}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelect={setTab}
        />

        <main className="chat-body">
          <div className="chat-main">
            {tab === "Focus" && <FocusView onStatus={setStatus} />}
            {tab === "Habits" && <HabitsView />}
            {tab === "Stats" && (
              <HeatmapView
                gifName={gifName}
                onGifChange={handleGifChange}
              />
            )}
          </div>
        </main>
      </div>
    </>
  );
}
