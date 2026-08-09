import { Suspense } from "react";
import SoumissionForm from "./SoumissionForm";

export const dynamic = "force-dynamic";

export default function Page() {
  // Borne Suspense requise par useSearchParams (lecture synchrone de ?modifier=).
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Chargement…</div>}>
      <SoumissionForm />
    </Suspense>
  );
}
