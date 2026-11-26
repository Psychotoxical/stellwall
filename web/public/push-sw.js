// Shows push messages and opens the page they point to. Loaded by the generated service worker.
self.addEventListener("push", (event) => {
  let data = { title: "Stellwall", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* a message without readable content still shows something */
  }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (open) return open.focus().then((c) => c.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
