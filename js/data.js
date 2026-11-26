// Fetch helpers. Paths are relative so the site works on GitHub Pages under a sub-path.
const cache = new Map();

export function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw Object.assign(new Error(`${r.status} ${path}`), { status: r.status });
      return r.json();
    }));
  }
  return cache.get(path);
}

/** Like getJSON but resolves to null when the file does not exist (e.g. a brief not written yet). */
export async function getOptionalJSON(path) {
  try {
    return await getJSON(path);
  } catch (e) {
    cache.delete(path);
    return null;
  }
}

export const sources = () => getJSON("data/web/sources.json");
export const measures = () => getJSON("data/web/measures.json");
export const countries = () => getJSON("data/web/countries.json");
export const glossary = () => getJSON("data/web/glossary.json");

export async function byId(listPromise) {
  const list = await listPromise;
  return Object.fromEntries(list.map((x) => [x.id, x]));
}
