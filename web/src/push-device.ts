/** iPhone, iPod or iPad; an iPad's Safari calls itself a Mac but has a touch screen. */
export function isAppleMobile() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

export const canPush = () => typeof Notification !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;

/** This browser's current push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!canPush()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}
