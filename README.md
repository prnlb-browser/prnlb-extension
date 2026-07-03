# PRNLB Viewer

A Chrome extension that extracts image URLs from Pornolab topic pages and displays them in a carousel overlay.

![Screenshot](.github/assets/screenshot.png)

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

## Support

BTC — `bc1q7q0536ctrllvf7sp0ghlw2evwz75jn7x7nzc79`  
ETH — `0x87c7CB3d62Bc70A19638A01064B2028fB89E37BF`

---

## PRNLB Viewer (Русский)

Расширение для Chrome, которое извлекает URL изображений со страниц тем Pornolab и отображает их в карусели.

### Установка в Chrome

1. Соберите проект (`npm run build`)
2. Откройте Chrome и перейдите по адресу `chrome://extensions/`
3. Включите **Режим разработчика** (переключатель в правом верхнем углу)
4. Нажмите **Загрузить распакованное расширение**
5. Выберите корневую директорию проекта (`prnlb-extension/`)

Расширение появится на панели инструментов. Откройте страницу темы на Pornolab и нажмите на иконку, чтобы открыть карусель скриншотов.

После внесения изменений выполните `npm run build` и нажмите кнопку **перезагрузки** на карточке расширения в `chrome://extensions/`.

### Поддержка

BTC — `bc1q7q0536ctrllvf7sp0ghlw2evwz75jn7x7nzc79`  
ETH — `0x87c7CB3d62Bc70A19638A01064B2028fB89E37BF`