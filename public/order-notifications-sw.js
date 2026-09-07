self.addEventListener('notificationclick', event => {
  event.notification.close();
  const id = event.notification.data?.orderId;
  if (!/^[a-f0-9-]{36}$/i.test(id || '')) return;
  event.waitUntil(clients.openWindow('/online-orders/' + id));
});
