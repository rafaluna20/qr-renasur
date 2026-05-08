/**
 * Service Worker para PWA del Cuaderno de Obra Digital
 * 
 * Características:
 * - Caché de recursos estáticos
 * - Caché de API responses
 * - Background Sync para sincronización offline
 * - Push Notifications
 * - Estrategias de caché inteligentes
 */

const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE = `cuaderno-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `cuaderno-dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE = `cuaderno-images-${CACHE_VERSION}`;

// Recursos estáticos críticos para cachear
const STATIC_FILES = [
  '/',
  '/cuaderno/nuevo',
  '/login',
  '/globals.css',
  '/manifest.json',
  '/offline.html'
];

// ============================================================================
// INSTALACIÓN
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...', CACHE_VERSION);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Precaching static assets');
        return cache.addAll(STATIC_FILES.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((error) => {
        console.error('[SW] Precache failed:', error);
      })
  );
  
  // Activar inmediatamente
  self.skipWaiting();
});

// ============================================================================
// ACTIVACIÓN
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...', CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Eliminar cachés antiguos
              return name.startsWith('cuaderno-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== IMAGE_CACHE;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
  );
  
  // Tomar control inmediatamente
  return self.clients.claim();
});

// ============================================================================
// FETCH - Estrategias de Caché
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Solo interceptar requests de nuestra app
  if (!url.origin.includes(self.location.origin) && !url.origin.includes('localhost')) {
    return;
  }
  
  // Estrategia según el tipo de recurso
  if (url.pathname.startsWith('/api/')) {
    // API: Network-first con fallback a caché
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
  } else if (request.destination === 'image') {
    // Imágenes: Cache-first
    event.respondWith(cacheFirstStrategy(request, IMAGE_CACHE));
  } else if (STATIC_FILES.includes(url.pathname)) {
    // Estáticos: Cache-first con update
    event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
  } else {
    // Default: Network-first
    event.respondWith(networkFirstStrategy(request, DYNAMIC_CACHE));
  }
});

// ============================================================================
// ESTRATEGIAS DE CACHÉ
// ============================================================================

/**
 * Network-first: Intenta red, fallback a caché
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    // Intentar red primero
    const networkResponse = await fetch(request);
    
    // Si es exitoso, actualizar caché
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    // Fallback a caché
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Si es navegación y no hay caché, mostrar página offline
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    // Último recurso: respuesta vacía
    return new Response('Sin conexión y sin caché disponible', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Cache-first: Intenta caché, fallback a red
 */
async function cacheFirstStrategy(request, cacheName) {
  // Buscar en caché primero
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // No hay caché: fetch de red
  try {
    const networkResponse = await fetch(request);
    
    // Guardar en caché para próxima vez
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache-first failed:', error);
    
    // Si es navegación, mostrar offline
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    }
    
    return new Response('Recurso no disponible', {
      status: 404,
      statusText: 'Not Found'
    });
  }
}

// ============================================================================
// BACKGROUND SYNC
// ============================================================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'sync-asientos') {
    event.waitUntil(syncPendingAsientos());
  }
});

/**
 * Sincroniza asientos pendientes con el servidor
 */
async function syncPendingAsientos() {
  try {
    console.log('[SW] Starting background sync of asientos...');
    
    // Abrir IndexedDB y obtener asientos pendientes
    const db = await openDB();
    const asientos = await getUnsyncedAsientos(db);
    
    if (asientos.length === 0) {
      console.log('[SW] No pending asientos to sync');
      return;
    }
    
    console.log(`[SW] Found ${asientos.length} pending asientos`);
    
    // Intentar sincronizar
    const response = await fetch('/api/cuaderno/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ asientos })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('[SW] Sync successful:', result);
      
      // Marcar como sincronizados
      await markAsientosSynced(db, asientos.map(a => a.offline_uuid));
      
      // Notificar al usuario
      self.registration.showNotification('Sincronización completada', {
        body: `${asientos.length} asiento(s) enviados a Odoo correctamente`,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        tag: 'sync-success',
        vibrate: [200, 100, 200]
      });
    } else {
      console.error('[SW] Sync failed:', response.status);
      throw new Error('Sync request failed');
    }
  } catch (error) {
    console.error('[SW] Background sync error:', error);
    
    // El navegador reintentará automáticamente
    throw error;
  }
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('[SW] Error parsing push data:', error);
  }
  
  const title = data.title || 'Cuaderno de Obra';
  const options = {
    body: data.body || 'Nueva notificación',
    icon: data.icon || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'close', title: 'Cerrar' }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'open' || event.action === '') {
    const urlToOpen = event.notification.data?.url || '/';
    
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          // Si ya hay una ventana abierta, enfocarla
          for (const client of clientList) {
            if (client.url === urlToOpen && 'focus' in client) {
              return client.focus();
            }
          }
          
          // Si no, abrir nueva ventana
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
          }
        })
    );
  }
});

// ============================================================================
// HELPERS - IndexedDB
// ============================================================================

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('cuaderno-db', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('asientos')) {
        db.createObjectStore('asientos', { keyPath: 'offline_uuid' });
      }
    };
  });
}

function getUnsyncedAsientos(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['asientos'], 'readonly');
    const store = transaction.objectStore('asientos');
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const all = request.result || [];
      const unsynced = all.filter(a => !a.synced);
      resolve(unsynced);
    };
  });
}

function markAsientosSynced(db, uuids) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['asientos'], 'readwrite');
    const store = transaction.objectStore('asientos');
    
    const promises = uuids.map(uuid => {
      return new Promise((res, rej) => {
        const getRequest = store.get(uuid);
        getRequest.onsuccess = () => {
          const asiento = getRequest.result;
          if (asiento) {
            asiento.synced = true;
            const putRequest = store.put(asiento);
            putRequest.onsuccess = () => res();
            putRequest.onerror = () => rej(putRequest.error);
          } else {
            res();
          }
        };
        getRequest.onerror = () => rej(getRequest.error);
      });
    });
    
    Promise.all(promises)
      .then(() => resolve())
      .catch((error) => reject(error));
  });
}

// ============================================================================
// MENSAJES DESDE LA APP
// ============================================================================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(DYNAMIC_CACHE)
        .then((cache) => cache.addAll(event.data.urls))
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(names.map((name) => caches.delete(name))))
    );
  }
});

console.log('[SW] Service Worker loaded successfully');
