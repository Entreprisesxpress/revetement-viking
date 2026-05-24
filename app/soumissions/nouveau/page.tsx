import { Suspense } from "react";
import SoumissionForm from "./SoumissionForm";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-500">Chargement...</div>}>
      <SoumissionForm />
    </Suspense>
  );
}
