"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@cashier/web-core/components/ui/states";

export default function WarehouseRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/inventory");
  }, [router]);

  return <LoadingState label="جارِ التحويل…" />;
}
