// Nur für System-Benachrichtigungen. Bewusst kein Caching, damit immer die aktuelle Version lädt.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const client = clients[0];
      return client ? client.focus() : self.clients.openWindow(self.registration.scope);
    }),
  );
});
