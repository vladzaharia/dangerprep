# FontAwesome Assets

This directory requires FontAwesome 7.0.0 files to be provided separately to avoid potential copyright issues.

## Required Files

You must provide the following directories and files from your FontAwesome 7.0.0 download:

### CSS Files
- `css/` - All CSS files including:
  - `all.min.css` - Complete FontAwesome styles
  - `solid.min.css` - Solid icons only
  - `regular.min.css` - Regular icons only  
  - `brands.min.css` - Brand icons only

### Web Fonts
- `webfonts/` - All web font files:
  - WOFF2 files
  - WOFF files
  - TTF files

### SVG Icons
- `svgs/` - Individual SVG icon files organized by style:
  - `solid/` - Solid style SVGs
  - `regular/` - Regular style SVGs
  - `brands/` - Brand style SVGs

### JavaScript (Optional)
- `js/` - JavaScript files for advanced usage

### Additional Assets
- `metadata/` - Icon metadata and search data
- `scss/` - SCSS source files
- `sprites/` - SVG sprite files
- `sprites-full/` - Full SVG sprite files

## How to Obtain FontAwesome

1. **Free Version**: Download from [FontAwesome Free](https://fontawesome.com/download)
2. **Pro Version**: If you have a FontAwesome Pro license, download from your account

## Installation

1. Download FontAwesome 7.0.0 from the official source
2. Extract the archive
3. Copy the required directories listed above to this location
4. Ensure the directory structure matches the CDN configuration

## Files Kept in Repository

The following files are kept in the repository as they contain configuration and licensing information:
- `LICENSE.txt` - FontAwesome license information
- `cdn.config.json` - CDN endpoint configuration
- `README.md` - This file

## Verification

After adding the files, verify the CDN endpoints work by checking:
- `/fontawesome/css/all.min.css` - Should serve the main CSS file
- `/fontawesome/webfonts/` - Should list available font files
- `/fontawesome/svgs/` - Should list available SVG directories

## License Compliance

Ensure you comply with FontAwesome's licensing terms:
- **Free License**: Requires attribution in your project
- **Pro License**: Follow your commercial license terms

Never commit the actual FontAwesome files to version control to avoid potential copyright violations.
