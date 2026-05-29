"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// La page Dépenses est désormais fusionnée dans Finances (onglet Dépenses).
export default function DepensesRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/finances?tab=depenses"); }, [router]);
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">
      Redirection vers Finances…
    </div>
  );
}
