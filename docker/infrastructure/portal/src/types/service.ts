/**
 * Service type definitions
 */

/**
 * Service metadata from the API
 */
export interface ServiceMetadata {
  name: string;
  description: string;
  icon: string;
  url?: string;
  type: 'public' | 'private' | 'maintenance';
  status: 'healthy' | 'warning' | 'error';
  version?: string;
}

