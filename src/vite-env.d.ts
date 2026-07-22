/// <reference types="vite/client" />

// Allow side-effect CSS imports (e.g. import 'leaflet/dist/leaflet.css')
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
