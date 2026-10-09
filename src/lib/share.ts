/** Build a shareable hash URL for this app (GitHub Pages base + HashRouter). */
export function buildShareUrl(path: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/?$/, '/')
  const hashPath = path.startsWith('/') ? path : `/${path}`
  return `${base}#${hashPath}`
}

/** Clipboard text for SNS: title line + URL (OG preview alone cannot vary per hash route). */
export function formatShareClipboard(title: string, path: string): string {
  return `${title}\n${buildShareUrl(path)}`
}

export function formatDayShareTitle(day: number, range: string): string {
  return `${day}일차 · ${range}`
}
