/**
 * Hook: useGeolocation
 * 
 * Hook personalizado para obtener la geolocalización del usuario
 * usando la API de Geolocation del navegador.
 * 
 * @example
 * ```tsx
 * const { coordinates, error, loading, getLocation } = useGeolocation();
 * 
 * const handleClick = async () => {
 *   const coords = await getLocation();
 *   if (coords) {
 *     console.log(`Lat: ${coords.latitude}, Lng: ${coords.longitude}`);
 *   }
 * };
 * ```
 */

import { useState, useCallback } from 'react';

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
}

interface UseGeolocationReturn {
  coordinates: Coordinates | null;
  error: string | null;
  loading: boolean;
  getLocation: () => Promise<Coordinates | null>;
  clearError: () => void;
}

/**
 * Opciones de configuración para la geolocalización
 */
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true, // Usar GPS si está disponible
  timeout: 10000, // 10 segundos de timeout
  maximumAge: 0, // No usar caché
};

/**
 * Hook para obtener la ubicación del usuario
 */
export function useGeolocation(): UseGeolocationReturn {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  /**
   * Obtener la ubicación actual del usuario
   */
  const getLocation = useCallback(async (): Promise<Coordinates | null> => {
    // Verificar si el navegador soporta geolocalización
    if (!navigator.geolocation) {
      const errorMsg = 'Tu navegador no soporta geolocalización';
      setError(errorMsg);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            GEOLOCATION_OPTIONS
          );
        }
      );

      const coords: Coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        timestamp: position.timestamp,
      };

      setCoordinates(coords);
      setLoading(false);
      return coords;
    } catch (err) {
      let errorMessage = 'Error desconocido al obtener ubicación';

      if (err instanceof GeolocationPositionError) {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMessage =
              'Permiso de ubicación denegado. Por favor, permite el acceso a tu ubicación en la configuración del navegador.';
            break;
          case err.POSITION_UNAVAILABLE:
            errorMessage =
              'Información de ubicación no disponible. Verifica tu conexión GPS/WiFi.';
            break;
          case err.TIMEOUT:
            errorMessage =
              'Tiempo de espera agotado al obtener la ubicación. Intenta nuevamente.';
            break;
          default:
            errorMessage = `Error de geolocalización: ${err.message}`;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      setLoading(false);
      return null;
    }
  }, []);

  /**
   * Limpiar el estado de error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    coordinates,
    error,
    loading,
    getLocation,
    clearError,
  };
}

/**
 * Utilidad: Calcular distancia entre dos coordenadas (fórmula de Haversine)
 * @param lat1 Latitud del primer punto
 * @param lon1 Longitud del primer punto
 * @param lat2 Latitud del segundo punto
 * @param lon2 Longitud del segundo punto
 * @returns Distancia en metros
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Radio de la Tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distancia en metros
}

/**
 * Utilidad: Formatear coordenadas para mostrar
 * @param latitude Latitud
 * @param longitude Longitud
 * @returns String formateado "lat, lng"
 */
export function formatCoordinates(
  latitude: number,
  longitude: number,
  decimals: number = 6
): string {
  return `${latitude.toFixed(decimals)}, ${longitude.toFixed(decimals)}`;
}
