"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/storage";
import type { User } from "@/lib/types";

type Props = {
  children: (user: User) => React.ReactNode;
  requireOnboarding?: boolean;
};

export function AuthGuard({ children, requireOnboarding = true }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const current = getCurrentUser();
    if (!current) {
      router.replace("/login");
      return;
    }
    if (requireOnboarding && !current.onboardedAt) {
      router.replace("/onboarding");
      return;
    }
    setUser(current);
    setReady(true);
  }, [router, requireOnboarding]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <>{children(user)}</>;
}
