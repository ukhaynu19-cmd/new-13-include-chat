// Service Worker for push notifications — Hill Academic Care
// Place this file at: public/sw.js

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: 'Hill Academic Care', body: event.data ? event.data.text() : 'You have a new notification' };
  }

  const title = data.title || 'Hill Academic Care';
  const options = {
    body: data.body || '',
    icon: '/uploads/icon.png',      // optional: put a small logo here if you have one, or remove this line
    badge: '/uploads/icon.png',     // optional: same as above
    data: { url: data.url || '/student' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// When the student taps the notification, open/focus the site
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/student';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
