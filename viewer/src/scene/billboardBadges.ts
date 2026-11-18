/**
 * Crisp zero-emoji SVG icon data URLs for CesiumJS Billboards.
 * Replaces generic circles and emoji text labels with precision aerospace glyphs.
 */

const iconCache = new Map<string, string>();

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Aerospace reticle diamond icon for ground stations (applied vs staged).
 */
export function getStationReticleIcon(hexColor: string, staged = false): string {
  const key = `station:${hexColor}:${staged}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const dash = staged ? 'stroke-dasharray="3 2"' : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="11" fill="none" stroke="${hexColor}" stroke-width="1.5" stroke-opacity="0.7" ${dash}/>
    <path d="M16 2v5M16 25v5M2 16h5M25 16h5" stroke="${hexColor}" stroke-width="1.6" stroke-linecap="square"/>
    <polygon points="16,10 22,16 16,22 10,16" fill="${hexColor}" fill-opacity="0.22" stroke="${hexColor}" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="2.2" fill="#f8fafc"/>
  </svg>`;

  const url = svgToDataUrl(svg);
  iconCache.set(key, url);
  return url;
}

/**
 * Precision orbital lock bracket icon for satellites when viewed at wide orbital range.
 */
export function getSatelliteReticleIcon(hexColor: string): string {
  const key = `sat:${hexColor}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <path d="M5 11V5h6M21 5h6v6M27 21v6h-6M11 27H5v-6" fill="none" stroke="${hexColor}" stroke-width="1.8" stroke-linecap="square"/>
    <circle cx="16" cy="16" r="2.5" fill="${hexColor}"/>
  </svg>`;

  const url = svgToDataUrl(svg);
  iconCache.set(key, url);
  return url;
}
