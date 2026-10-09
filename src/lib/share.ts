/** Build a shareable hash URL for this app (GitHub Pages base + HashRouter). */
export function buildShareUrl(path: string): string {
  const base = `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/?$/, '/')
  const hashPath = path.startsWith('/') ? path : `/${path}`
  return `${base}#${hashPath}`
}
