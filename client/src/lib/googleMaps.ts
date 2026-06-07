import { useJsApiLoader } from '@react-google-maps/api'

// Must be defined outside components to prevent re-load warnings.
// DirectionsService/Renderer are part of the core Maps JS script, so only 'places' is needed here.
const LIBRARIES: ('places')[] = ['places']

export function useGoogleMapsLoader() {
  return useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
    libraries: LIBRARIES,
  })
}

export const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#12122a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#12122a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2d2d50' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a2a45' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9ca5b3' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#383860' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#262645' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#080810' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#2d3748' }] },
]
