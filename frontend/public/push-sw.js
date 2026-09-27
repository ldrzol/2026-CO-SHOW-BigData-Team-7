// FCM 푸시를 받아서 알림으로 띄워요
self.addEventListener('push', (e) => {
  const { notification = {} } = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(notification.title ?? '삐뚤', {
      body: notification.body,
      icon: '/icon-192.png',
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  e.waitUntil(clients.openWindow('/'))
})