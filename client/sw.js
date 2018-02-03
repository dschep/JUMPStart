self.addEventListener('push', function(event) {
  var payload = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification('JUMPStart', {
      body: payload.message,
      icon: 'jumpstart.png',
      actions: [
        {action: 'view-map', title: 'View in Google Maps'},
      ],
      data: payload,
    })
  );
});


self.addEventListener('notificationclick', function(event) {  
  event.notification.close();

  clients.openWindow(event.notification.data.url);  
}, false);

