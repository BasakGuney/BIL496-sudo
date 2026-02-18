import React from "react";
import { TopBar } from "./TopBar";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-screen bg-background text-foreground">
      <TopBar />


      <main className="w-full px-4 md:px-6 py-6">
        {children}
      </main>

      <footer className="mt-10 pb-6 text-sm text-muted-foreground">
        <div className="px-4 md:px-6">
          © 2026 • AI Mock Interview • Supportive / Neutral
        </div>
      </footer>
    </div>
  );
}
