# PRNLB Viewer

A Chrome extension that extracts image URLs from Pornolab topic pages and displays them in a carousel overlay.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm

### Setup

```bash
npm install
```

### Build

```bash
# One-time build
npm run build

# Watch mode (auto-rebuild on changes)
npm run watch
```

This compiles TypeScript sources from `src/` into bundled JavaScript in `dist/`.

### Type checking

```bash
npx tsc --noEmit
```

## Install in Chrome

1. Build the project (`npm run build`)
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked**
5. Select the project root directory (`prnlb-extension/`)

The extension will appear in your toolbar. Navigate to a Pornolab topic page and click the icon to open the screenshot carousel.

After making changes, run `npm run build` again and click the **reload** button on the extension card in `chrome://extensions/`.