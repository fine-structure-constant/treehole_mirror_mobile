import { DEFAULT_SOURCE } from './api.mjs';

const KEY = 'treehole-mirror-v1';

export function loadSettings(storage = globalThis.localStorage) {
  let saved;
  try { saved = JSON.parse(storage.getItem(KEY)); } catch { saved = null; }
  const sources = Array.isArray(saved?.sources) && saved.sources.length ? saved.sources : [DEFAULT_SOURCE];
  return {
    sources,
    active: sources.some(source => source.url === saved?.active) ? saved.active : sources[0].url,
    theme: ['auto', 'light', 'dark'].includes(saved?.theme) ? saved.theme : 'auto',
    images: saved?.images !== false,
    history: saved?.history !== false,
    previews: saved?.previews !== false,
    muted: Array.isArray(saved?.muted) ? saved.muted : [],
    library: saved?.library && typeof saved.library === 'object' ? saved.library : {},
  };
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  storage.setItem(KEY, JSON.stringify(settings));
}

export function sourceLibrary(settings, url = settings.active) {
  return settings.library[url] ??= { saved: [], history: [], queries: [], groups: [] };
}

export function brief(post) {
  return { ...post, text: post.hidden ? '' : post.text.slice(0, 1800), comments: [] };
}

export function remember(items, entry, key, limit) {
  return [entry, ...items.filter(item => key(item) !== key(entry))].slice(0, limit);
}
