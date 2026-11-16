// Embeds the researcher's question with the same model used offline (all-MiniLM-L6-v2),
// in a worker so the page never stutters. The model downloads once (about 23 MB) and the browser caches it.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/+esm";

env.allowLocalModels = false;
env.useBrowserCache = true;
let extractor = null;
let loading = null;

function load(model) {
  if (!loading) {
    loading = pipeline("feature-extraction", model).then((p) => (extractor = p));
  }
  return loading;
}

self.onmessage = async (e) => {
  const { id, type, text, model } = e.data;
  try {
    await load(model);
    if (type === "warm") {
      self.postMessage({ id, ready: true });
      return;
    }
    const out = await extractor(text, { pooling: "mean", normalize: true });
    const vec = Float32Array.from(out.data);
    self.postMessage({ id, vec }, [vec.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
