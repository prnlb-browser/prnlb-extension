# PRNLB Viewer contributor guide

## Project purpose

PRNLB Viewer is a Manifest V3 Chrome/Firefox extension for Pornolab. It supports two user-facing modes:

1. A topic-page carousel that extracts screenshots from the first post and resolves supported image hosts.
2. A topic-list mode for forum, tracker, and search-result pages that loads a preview for each topic and provides a button to open that topic's carousel.

## Repository layout

- `src/background.ts` — service-worker entry point and dependency wiring.
- `src/background/` — URL matching, Pornolab HTML parsing, topic preview loading, image resolution, action routing, and runtime message routing.
- `src/content.ts` — content-script entry point and message dispatch.
- `src/content/carousel.ts` — topic-page carousel UI and progressive resolution display.
- `src/content/topicList.ts` — topic-list table discovery, row previews, buttons, and progress UI.
- `src/content/imageExtractor.ts` — DOM extraction for the current topic page.
- `src/resolvers/` — image-host-specific resolver implementations and the resolver registry.
- `src/tabLoader.ts` — temporary-tab loading, readiness polling, timeout handling, and abort support.
- `manifest.json` — extension permissions, host permissions, and content-script matches.
- `build.mjs` — esbuild entry points and static-asset copying.
- `dist/` — generated unpacked extension output; do not edit it directly.

## Development commands

```bash
npm install
npm exec tsc -- --noEmit
npm run build
npm run watch
npm run sign
```

Run type checking and a production build after source changes. There is currently no automated test suite, so behavior changes also require manual smoke testing in a loaded unpacked extension.

## Architecture rules

- Keep `src/background.ts` as a thin bootstrap file. Put parsing, orchestration, and lifecycle state in focused modules under `src/background/`.
- Keep carousel and topic-list UI logic separate under `src/content/`.
- Preserve the message actions defined in `src/types.ts` unless a coordinated change is required in both the background and content scripts.
- Use `AbortSignal` for work that opens temporary tabs or resolves image hosts. Topic-list loads are scoped to their initiating list tab; carousel resolution is scoped to its initiating topic tab.
- Use the shared URL predicates in `src/background/urlMatcher.ts` for supported Pornolab pages. Keep URL checks restricted to HTTPS `pornolab.net` pages.
- Keep image-host-specific parsing inside its resolver. Register new resolvers in `src/resolvers/registry.ts` and update manifest host permissions when required.
- Do not edit generated files in `dist/`; run the build instead.

## Resolver guidance

Each resolver implements `ImageHostResolver` from `src/resolvers/types.ts`:

- `canHandle(url)` should be narrow and safe for unrelated URLs.
- `resolve(url, signal)` should honor abort signals when loading a page or waiting for a result.
- Return `null` when a URL cannot be resolved; do not make one resolver's failure stop the whole carousel.
- Use `loadPageHtml` when a host requires a rendered browser page rather than a direct request.

## Manual verification checklist

When changing extraction, background services, or UI behavior, verify:

- Topic-page carousel opens from the toolbar icon.
- Images resolve progressively and navigation works.
- Closing the carousel aborts outstanding resolution.
- Forum topic lists populate previews and screenshot buttons.
- Tracker/search-result tables are handled.
- A topic-list screenshot button opens the correct topic's carousel.
- Leaving a list page aborts its background topic loads.
- Leaving a topic page aborts carousel resolution.
- Unsupported hosts fail gracefully.
- TurboImageHost human-check handling still works.
