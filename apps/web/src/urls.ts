/** Preserve normal API URLs; project Pages hosts its autonomous API inside /demo/. */
export const appUrl = (path: string) =>
  import.meta.env.VITE_STATIC_DEMO &&
  path.startsWith("/") &&
  !path.startsWith(import.meta.env.BASE_URL)
    ? import.meta.env.BASE_URL + path.slice(1)
    : path;
