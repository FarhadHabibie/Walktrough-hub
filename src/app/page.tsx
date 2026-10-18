"use client";

import { useEffect } from "react";
import { useRoute } from "@/lib/router";
import { ensureSeeded } from "@/lib/store";
import GameView from "@/views/GameView";
import HomeView from "@/views/HomeView";

const HOME_TITLE = "WalkthroughHub — Walkthrough lengkap untuk setiap game";

export default function App() {
  const route = useRoute();
  const routeKey = route.view === "game" ? `game:${route.slug}` : "home";

  useEffect(() => {
    // One-time import of the catalog shipped with the app (no-op afterwards).
    void ensureSeeded();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    if (route.view === "home") document.title = HOME_TITLE;
  }, [routeKey, route.view]);

  if (route.view === "game") {
    return (
      <GameView
        key={`${route.slug}:${route.titleHint ?? ""}:${route.platformHint ?? ""}`}
        slug={route.slug}
        titleHint={route.titleHint}
        platformHint={route.platformHint}
      />
    );
  }
  return <HomeView />;
}
