"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  installUpdate,
  onUpdateAvailable,
  pendingUpdate,
} from "@/lib/desktop-update";

export function UpdateBannerView({
  version,
  installing,
  onInstall,
}: {
  version: string | null;
  installing: boolean;
  onInstall: () => void;
}) {
  if (!version) return null;
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-ink"
    >
      <span>
        يتوفر إصدار جديد من كاشير ({version}). الوردية المفتوحة تبقى كما هي بعد
        التحديث.
      </span>
      <button
        type="button"
        onClick={onInstall}
        disabled={installing}
        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 font-medium text-white hover:bg-primary-strong disabled:opacity-60"
      >
        <Download className="size-4" />
        {installing ? "جارٍ إغلاق كاشير للتحديث…" : "تحديث الآن"}
      </button>
    </div>
  );
}

/** Desktop only: shows the "Update available" button (plan 6.3). */
export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let active = true;
    void pendingUpdate().then((found) => {
      if (active && found) setVersion(found);
    });
    const stop = onUpdateAvailable(setVersion);
    return () => {
      active = false;
      stop();
    };
  }, []);

  return (
    <UpdateBannerView
      version={version}
      installing={installing}
      onInstall={() => {
        setInstalling(true);
        installUpdate().catch(() => setInstalling(false));
      }}
    />
  );
}
