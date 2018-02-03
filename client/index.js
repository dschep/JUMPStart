// cribbed from https://github.com/web-push-libs/web-push/tree/f18c2f36472197b3273eb42ac1f5430c35acc120#using-vapid-key-for-applicationserverkey
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const map = L.map('map').setView([38.918, -77.040], 11);

L.tileLayer('https://{s}.tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey={apikey}', {
  attribution: '&copy; <a href="http://www.thunderforest.com/">Thunderforest</a>, &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  apikey: '43a3528946814e018e2667b156d87992',
  maxZoom: 22
}).addTo(map)

const lc = L.control.locate({
  locateOptions: { maxZoom: 14 }
}).addTo(map);
map.on('locationfound', e => {userLocation = e.latlng;});
lc.start();

L.control.mapCenterCoord().addTo(map);

document.querySelector('button').onclick = () => {
  navigator.serviceWorker.register('./sw.js')
    .then((registration) => registration.pushManager.getSubscription()
      .then((subscription) => (subscription || registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array('BFyII4W6YBUU9p-h2jYqrbMeR5zdny3oYULYIwttBYVXxDIken5mqiXcrPy8on1hzUiUYawE4YDoyGNBLsOR8ts'),
      }))))
      // hack to convert to object :/
      .then((pushSubscription) => JSON.parse(JSON.stringify(pushSubscription)))
      // add location
      .then((pushSubscription) => {
        pushSubscription.location = map.getCenter();
        return pushSubscription;
      })
      // POST to backend
      .then((pushSubscription) => fetch('https://d7zkv7kce6.execute-api.us-east-1.amazonaws.com/dev/register', {
        method: 'POST',
        body: JSON.stringify(pushSubscription),
        cors: true,
        headers: {'Content-Type': 'application/json'},
      }))
    .catch(console.log);
};
