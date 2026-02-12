export async function requestNotificationPermissionIfNeeded() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

export async function notifyFocusSessionCompleted(goalName?: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const title = "Focus session completed";
  const body = goalName
    ? `Your session for "${goalName}" has finished.`
    : "Your focus session has finished.";

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: "/icon.svg",
          badge: "/icon.svg",
          tag: "focus-completed",
          renotify: true,
        });
        return;
      }
    }
    new Notification(title, { body, icon: "/icon.svg" });
  } catch {
    // ignore notification failures
  }
}

