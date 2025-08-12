import { promises as fs } from 'fs';
import path from 'path';

/**
 * Template data interface for rendering WebAwesome templates
 */
export interface TemplateData {
  // Page metadata
  pageTitle: string;
  appTitle?: string;
  bodyClass?: string;
  
  // Content sections
  content: string;
  headerActions?: string;
  navigationHeader?: string;
  navigation?: string;
  mainHeader?: string;
  mainFooter?: string;
  
  // Navigation
  breadcrumbs?: Array<{
    text: string;
    href?: string;
  }>;
  
  // Custom styles and scripts
  customStyles?: string;
  additionalHead?: string;
  additionalScripts?: string;
}

/**
 * App metadata for service discovery
 */
export interface AppMetadata {
  name: string;
  description: string;
  icon: string;
  url: string;
  category: string;
  version?: string;
  status?: 'healthy' | 'warning' | 'error';
}

/**
 * Simple template renderer with Handlebars-like syntax
 */
export class TemplateRenderer {
  private templateCache = new Map<string, string>();
  private readonly templateDir: string;

  constructor(templateDir: string = path.join(__dirname, '..', 'templates')) {
    this.templateDir = templateDir;
  }

  /**
   * Render a template with the provided data
   */
  async render(templateName: string, data: TemplateData): Promise<string> {
    const template = await this.loadTemplate(templateName);
    return this.processTemplate(template, data);
  }

  /**
   * Load template from file system with caching
   */
  private async loadTemplate(templateName: string): Promise<string> {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    const templatePath = path.join(this.templateDir, `${templateName}.html`);
    
    try {
      const template = await fs.readFile(templatePath, 'utf8');
      this.templateCache.set(templateName, template);
      return template;
    } catch (error) {
      throw new Error(`Failed to load template '${templateName}': ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Process template with simple Handlebars-like syntax
   */
  private processTemplate(template: string, data: Record<string, unknown>): string {
    let result = template;

    // Handle {{variable}} replacements
    result = result.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      
      // Handle conditionals: {{#if variable}}
      if (trimmedKey.startsWith('#if ')) {
        const varName = trimmedKey.substring(4).trim();
        const value = this.getNestedValue(data, varName);
        return value ? '' : '<!--IF_FALSE-->';
      }
      
      // Handle end conditionals: {{/if}}
      if (trimmedKey === '/if') {
        return '<!--END_IF-->';
      }
      
      // Handle each loops: {{#each array}}
      if (trimmedKey.startsWith('#each ')) {
        const arrayName = trimmedKey.substring(6).trim();
        const array = this.getNestedValue(data, arrayName) as unknown[];
        return Array.isArray(array) ? '<!--EACH_START-->' : '<!--EACH_SKIP-->';
      }
      
      // Handle end each: {{/each}}
      if (trimmedKey === '/each') {
        return '<!--EACH_END-->';
      }
      
      // Handle triple braces for unescaped HTML: {{{variable}}}
      if (match.startsWith('{{{') && match.endsWith('}}}')) {
        const varName = trimmedKey;
        const value = this.getNestedValue(data, varName);
        return value != null ? String(value) : '';
      }
      
      // Regular variable replacement
      const value = this.getNestedValue(data, trimmedKey);
      return value != null ? this.escapeHtml(String(value)) : '';
    });

    // Process conditionals
    result = this.processConditionals(result);
    
    // Process each loops
    result = this.processEachLoops(result, data);

    return result;
  }

  /**
   * Get nested value from object using dot notation
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined;
    }, obj);
  }

  /**
   * Process conditional blocks
   */
  private processConditionals(template: string): string {
    let result = template;
    
    // Remove false conditional blocks
    result = result.replace(/<!--IF_FALSE-->[\s\S]*?<!--END_IF-->/g, '');
    
    // Clean up true conditional markers
    result = result.replace(/<!--IF_TRUE-->|<!--END_IF-->/g, '');
    
    return result;
  }

  /**
   * Process each loops
   */
  private processEachLoops(template: string, data: Record<string, unknown>): string {
    let result = template;
    
    // Find each blocks
    const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    
    result = result.replace(eachRegex, (match, arrayName, blockContent) => {
      const array = this.getNestedValue(data, arrayName.trim()) as unknown[];
      
      if (!Array.isArray(array)) {
        return '';
      }
      
      return array.map((item, index) => {
        let itemContent = blockContent;
        
        // Replace {{this}} with current item
        itemContent = itemContent.replace(/\{\{this\}\}/g, String(item));
        
        // Replace {{@index}} with current index
        itemContent = itemContent.replace(/\{\{@index\}\}/g, String(index));
        
        // Replace {{@last}} with boolean indicating if this is the last item
        itemContent = itemContent.replace(/\{\{@last\}\}/g, String(index === array.length - 1));
        
        // Handle object properties if item is an object
        if (typeof item === 'object' && item !== null) {
          const itemObj = item as Record<string, unknown>;
          itemContent = itemContent.replace(/\{\{([^}]+)\}\}/g, (propMatch, propKey) => {
            const trimmedPropKey = propKey.trim();
            if (trimmedPropKey in itemObj) {
              const value = itemObj[trimmedPropKey];
              return value != null ? this.escapeHtml(String(value)) : '';
            }
            return propMatch;
          });
        }
        
        return itemContent;
      }).join('');
    });
    
    return result;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const htmlEscapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    
    return text.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templateCache.clear();
  }

  /**
   * Generate WebAwesome fallback script
   */
  static generateWebAwesomeFallback(): string {
    return `
      <script>
        // WebAwesome CDN fallback handler
        (function() {
          const links = document.querySelectorAll('link[href*="cdn.danger/webawesome"]');
          const scripts = document.querySelectorAll('script[src*="cdn.danger/webawesome"]');
          
          // Check if local CDN is available
          fetch('https://cdn.danger/webawesome/dist/webawesome.js', { method: 'HEAD' })
            .catch(() => {
              console.warn('Local WebAwesome CDN unavailable, switching to webawesome.com');
              
              // Replace CSS links
              links.forEach(link => {
                const fallbackHref = link.href.replace(
                  'https://cdn.danger/webawesome',
                  'https://early.webawesome.com/webawesome@3.0.0-beta.4'
                );
                link.href = fallbackHref;
              });
              
              // Replace script sources
              scripts.forEach(script => {
                const fallbackSrc = script.src.replace(
                  'https://cdn.danger/webawesome',
                  'https://early.webawesome.com/webawesome@3.0.0-beta.4'
                );
                script.src = fallbackSrc;
              });
            });
        })();
      </script>
    `;
  }
}

/**
 * Default template renderer instance
 */
export const templateRenderer = new TemplateRenderer();

/**
 * Utility function to create common template data
 */
export function createTemplateData(
  pageTitle: string,
  content: string,
  options: Partial<TemplateData> = {}
): TemplateData {
  return {
    pageTitle,
    content,
    ...options
  };
}

/**
 * Utility function to create app metadata
 */
export function createAppMetadata(
  name: string,
  description: string,
  icon: string,
  url: string,
  category: string,
  options: Partial<AppMetadata> = {}
): AppMetadata {
  return {
    name,
    description,
    icon,
    url,
    category,
    ...options
  };
}
