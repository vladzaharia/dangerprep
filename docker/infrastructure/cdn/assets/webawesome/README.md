# Web Awesome Assets

This directory requires Web Awesome 3.0.0-beta.4 files to be provided separately to avoid potential copyright issues.

## Required Files

You must provide the following directory and files from your Web Awesome download:

### Distribution Files
- `dist/` - Complete Web Awesome distribution including:
  - `styles/webawesome.css` - Core Web Awesome CSS
  - `styles/themes/default.css` - Default theme CSS
  - `styles/color/palettes/default.css` - Default color palette
  - `webawesome.loader.js` - Component loader (ES Module)
  - `webawesome.js` - Core Web Awesome JavaScript
  - All other distribution files and subdirectories

## How to Obtain Web Awesome

Web Awesome is a commercial product. You must:

1. **Purchase a License**: Visit [Web Awesome](https://webawesome.com) to purchase a license
2. **Download**: Access your licensed files from your Web Awesome account
3. **Version**: Ensure you download version 3.0.0-beta.4 or compatible

## Installation

1. Purchase and download Web Awesome 3.0.0-beta.4 from the official source
2. Extract the archive
3. Copy the entire `dist/` directory to this location
4. Ensure the directory structure matches the CDN configuration

## Files Kept in Repository

The following files are kept in the repository as they contain configuration and licensing information:
- `LICENSE.md` - Web Awesome license information
- `USAGE.md` - Usage documentation
- `cdn.config.json` - CDN endpoint configuration
- `README.md` - This file

## Verification

After adding the files, verify the CDN endpoints work by checking:
- `/webawesome/dist/styles/webawesome.css` - Should serve the main CSS file
- `/webawesome/dist/webawesome.loader.js` - Should serve the loader script
- `/webawesome/dist/webawesome.js` - Should serve the core JavaScript

## License Compliance

Web Awesome is a **commercial product**. Ensure you:
- Have a valid license for your use case
- Follow the terms of your Web Awesome license agreement
- Do not redistribute the files without proper licensing

## Important Notes

- Web Awesome requires a commercial license for most use cases
- Never commit the actual Web Awesome distribution files to version control
- Ensure your license covers your intended deployment and usage
- Keep your license documentation accessible for compliance verification

## Support

For licensing questions or technical support, contact Web Awesome directly through their official channels.
