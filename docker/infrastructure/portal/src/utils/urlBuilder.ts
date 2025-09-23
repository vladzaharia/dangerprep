/**
 * URL Builder Utility
 * 
 * Constructs service URLs dynamically from base domain and subdomain configuration.
 * This allows the portal to work with different domains (danger, danger.diy, argos.surf, etc.)
 * by simply changing environment variables.
 */

/**
 * Constructs a full HTTPS URL from a base domain and subdomain
 * 
 * @param baseDomain - The base domain (e.g., "argos.surf", "danger.diy")
 * @param subdomain - The service subdomain (e.g., "media", "kiwix", "retro")
 * @returns Full HTTPS URL (e.g., "https://media.argos.surf")
 */
export function buildServiceUrl(baseDomain: string, subdomain: string): string {
  if (!baseDomain || !subdomain) {
    throw new Error('Both baseDomain and subdomain are required to build service URL');
  }
  
  // Ensure we always use HTTPS
  return `https://${subdomain}.${baseDomain}`;
}

/**
 * Gets environment variables with fallbacks and constructs main service URLs
 */
export function getServiceUrls() {
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'danger';

  const jellyfinSubdomain = import.meta.env.VITE_JELLYFIN_SUBDOMAIN || 'media';
  const kiwixSubdomain = import.meta.env.VITE_KIWIX_SUBDOMAIN || 'kiwix';
  const rommSubdomain = import.meta.env.VITE_ROMM_SUBDOMAIN || 'retro';

  return {
    jellyfin: buildServiceUrl(baseDomain, jellyfinSubdomain),
    kiwix: buildServiceUrl(baseDomain, kiwixSubdomain),
    romm: buildServiceUrl(baseDomain, rommSubdomain),
  };
}

/**
 * Gets environment variables with fallbacks and constructs maintenance service URLs
 */
export function getMaintenanceServiceUrls() {
  const baseDomain = import.meta.env.VITE_BASE_DOMAIN || 'danger';

  const docmostSubdomain = import.meta.env.VITE_DOCMOST_SUBDOMAIN || 'docmost';
  const onedevSubdomain = import.meta.env.VITE_ONEDEV_SUBDOMAIN || 'onedev';
  const traefikSubdomain = import.meta.env.VITE_TRAEFIK_SUBDOMAIN || 'traefik';
  const komodoSubdomain = import.meta.env.VITE_KOMODO_SUBDOMAIN || 'komodo';

  return {
    docmost: buildServiceUrl(baseDomain, docmostSubdomain),
    onedev: buildServiceUrl(baseDomain, onedevSubdomain),
    traefik: buildServiceUrl(baseDomain, traefikSubdomain),
    komodo: buildServiceUrl(baseDomain, komodoSubdomain),
  };
}
