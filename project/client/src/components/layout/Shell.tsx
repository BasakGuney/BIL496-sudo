import React from "react";
import { TopBar } from "./TopBar";

export function Shell({ 
  children,
  onNavigateHistory,
  onNewInterview
}: { 
  children: React.ReactNode;
  onNavigateHistory?: () => void;
  onNewInterview?: () => void;
}) {
  return (
    <div className="min-h-screen w-full relative overflow-x-hidden">
      <TopBar 
        onNavigateHistory={onNavigateHistory} 
        onNewInterview={onNewInterview}
      />

      <main className="w-full relative z-10">
        {children}
      </main>
    </div>
  );
}
