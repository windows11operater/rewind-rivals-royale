// Browser-side loader for the user's island: walkable heights (baked from the island mesh, then cleaned:
// building/tree bumps removed, fake pits filled, smoothed) and the top-down picture that textures the
// ground and the minimap. Scene.tsx builds the ground mesh from these same heights.
import heightAsset from "@/assets/map/island_h512_smooth.bin.asset.json";
import colorAsset from "@/assets/map/island_color.webp.asset.json";
/** Height file: 512 x 512 little-endian uint16, metres = v / 65535 * 80 - 40, row 0 = north (-z), spans +-MAP. */
const H_RANGE = 80, H_OFF = -40;

export interface IslandData { heights: Float32Array; top: HTMLImageElement | null }
let pending: Promise<IslandData> | null = null;
export let islandTop: HTMLImageElement | null = null;

export function loadIsland(): Promise<IslandData> {
  if (pending) return pending;
  pending = (async () => {
    const [buf, top] = await Promise.all([
      fetch(heightAsset.url).then((r) => { if (!r.ok) throw new Error(`island heights ${r.status}`); return r.arrayBuffer(); }),
      new Promise<HTMLImageElement | null>((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = colorAsset.url; }),
    ]);
    const u = new Uint16Array(buf);
    const heights = new Float32Array(u.length);
    for (let i = 0; i < u.length; i++) heights[i] = ((u[i] ?? 0) / 65535) * H_RANGE + H_OFF;
    islandTop = top;
    return { heights, top };
  })();
  pending.catch(() => { pending = null; });
  return pending;
}
