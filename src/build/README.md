# Build Resources

This directory contains build resources for the Electron app.

## Required Files

### macOS
- `icon.icns` - App icon for macOS (512x512 recommended, will be auto-scaled)

### Windows
- `icon.ico` - App icon for Windows

### Linux
- `icons/` - Directory with icon files at various sizes (16x16, 32x32, 48x48, 128x128, 256x256, 512x512)

## Creating Icons

You can use tools like:
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)
- [png2icns](https://cloudconvert.com/png-to-icns) (online)
- macOS Preview app (open PNG, export as ICNS)

### From a 1024x1024 PNG:

```bash
# Install electron-icon-builder
npm install -g electron-icon-builder

# Generate all icon formats
electron-icon-builder --input=icon.png --output=./
```
