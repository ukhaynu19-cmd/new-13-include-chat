// Place this file at: public/js/push-subscribe.js
// Include it on student pages with: <script src="/js/push-subscribe.js"></script>

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push notifications are not supported on this browser.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notifications were not enabled. You can turn them on later from your browser/site settings.');
      return;
    }

    const publicKeyRes = await fetch('/push/vapid-public-key');
    const publicKey = await publicKeyRes.text();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch('/student/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    const btn = document.getElementById('enable-push-btn');
    if (btn) {
      btn.textContent = 'Notifications Enabled ✓';
      btn.disabled = true;
    }
  } catch (err) {
    console.error('Push subscription failed:', err);
    alert('Something went wrong enabling notifications. Please try again.');
  }
}
