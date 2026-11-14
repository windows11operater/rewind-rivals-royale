import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Lobby } from "@/game/Lobby";
import { Game } from "@/game/Game";
import { DeviceGate } from "@/game/DeviceGate";
import { useMeta } from "@/game/store";
import { RotateHint, usePortrait } from "@/game/ui";
import { preloadSkins } from "@/game/CharacterModel";
import { SKINS } from "@/game/data";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Project Rewind — Classic Battle Royale" },
      { name: "description", content: "Drop from the bus, loot chests and outlast 29 others in a nostalgic season-one battle royale." },
      { property: "og:title", content: "Project Rewind — Classic Battle Royale" },
      { property: "og:description", content: "Solos, duos and squads. Chests, pickaxes, building, storm, battle pass and R Bucks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const device = useMeta((s) => s.device);
  const portrait = usePortrait();
  const [screen, setScreen] = useState<"lobby" | "game">("lobby");
  const [key, setKey] = useState(0);
  // start downloading the equipped outfit right away (even behind the device screen), then the rest
  useState(() => {
    const eq = (SKINS.find((s) => s.id === useMeta.getState().equipped) ?? SKINS[0])!;
    preloadSkins([eq], "high");
    setTimeout(() => preloadSkins(SKINS.filter((s) => s !== eq), "high"), 1500);
    return 0;
  });
  if (!device) return <DeviceGate />;
  return (
    <>
      {screen === "lobby"
        ? <Lobby onPlay={() => { setKey((k) => k + 1); setScreen("game"); }} />
        : <Game key={key} onExit={() => setScreen("lobby")} />}
      {device === "mobile" && portrait && <RotateHint />}
    </>
  );
}
