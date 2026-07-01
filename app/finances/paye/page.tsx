"use client";

import Navigation from "@/components/Navigation";
import PaieVue from "@/components/PaieVue";

export default function PayePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation titre="💵 Paie" soustitre="Suivi bi-hebdomadaire · banque d'heures (max 80 h/période)" />
      <main className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
        <PaieVue />
      </main>
    </div>
  );
}
