"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/ui/states";

export default function CafeRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inventory?warehouse=cafe");
  }, [router]);

  return <LoadingState label="جارِ التحويل…" />;
}
