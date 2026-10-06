"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoadingState } from "@/components/ui/states";

export default function CafeTransferDetailRedirectPage() {
  return (
    <Suspense fallback={<LoadingState label="جارِ التحويل…" />}>
      <CafeTransferDetailRedirect />
    </Suspense>
  );
}

function CafeTransferDetailRedirect() {
  const id = useSearchParams().get("id");
  const router = useRouter();

  useEffect(() => {
    router.replace(`/transfers/detail?id=${id ?? ""}`);
  }, [id, router]);

  return <LoadingState label="جارِ التحويل…" />;
}
