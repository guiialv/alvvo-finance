"use client";

import { openTour } from "@/components/tour";

export function TourButton({ className = "btn" }: { className?: string }) {
  return <button type="button" className={className} onClick={openTour}>Fazer o tour pelo Início</button>;
}
