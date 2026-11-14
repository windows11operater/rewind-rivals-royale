<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project Rewind
- Game rules/simulation live in `src/game/sim.ts` (no React); `Scene.tsx` only draws sim state — keeps physics testable and the render layer swappable.
- Characters are the user's static outfit GLBs auto-rigged at load by `autoRig.ts` (12 bones named like CharRefs, shared skinned geometry per model URL, own bones per instance); Scene/LobbyStage animate only through CharRefs bones — keep those names stable.
- Lobby 3D labels are projected manually (`Projector` in `LobbyStage.tsx`), not drei `<Html>` — drei Html loses content under React 19 StrictMode.
- Lobby music is a looping uploaded track played via `src/game/music.ts`; in-match sounds live in `audio.ts` — user-supplied samples (e.g. Tactical Shotgun) are decoded there, everything else is synthesized.
- Harvesting (weak point, prop HP, resource pops, HP bar) is sim state in `sim.ts` (`weak`, `harvestFx`, `hpBar`, `shake`, `propVer`); `HarvestFx`/`Trees` in Scene only draw it.
- Only gun kinds with a dedicated user model exist (`GUN_KINDS` in sim.ts); never reuse one model for another gun.
- Building is grid-based in `sim.ts` (`Build` pieces on 4 m cells: walls on cell edges stored canonically as +z/+x, floors/ramps/cones as walkable surfaces via `supportY`); render and blueprint preview read `sim.builds` / `sim.preview` only.
- The match ground is a heightfield mesh built in `Scene.tsx` from `sim.terrain` (the cleaned 512 height grid baked offline from the user's island) and textured with the island's top-down picture — the raw island GLB rendered distorted, so it is no longer drawn. Town streets/plazas/pitch are painted by `mapArt.ts` into an overlay blended on the mesh in world space — add painted features there, not as planes (z-fighting).
- Controller input goes through `gamepad.ts` (`PadReader` for matches, `useGamepadButtons` for menus); the device choice (`device` in the store) gates the app in `routes/index.tsx`.
- HUD/menu sizing uses `Scaled` + `useUiScale` from `ui.tsx` (transform scale, not CSS zoom); never wrap an R3F Canvas in it.
- Map buildings are world `Build` pieces made by `addBuilding` in `sim.ts` (doors, windows, floor slabs, corner ramp stairs, roof) and indexed in `sim.grid` by cell; collision, support and rays query the grid, and `sim.buildVer` bumps on any change — keeps houses destructible/editable with the same rules as player builds.
- Ground height comes from `terrain.ts` (`Terrain`, heightmap nodes on a 256 grid, POI plateaus flattened at match start); sim uses `terrain.ground()` everywhere instead of y=0 — the render terrain must sample the same grid.
