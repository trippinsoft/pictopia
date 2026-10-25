import { useEffect, useState } from "react";
import { repository } from "@/services/repository";
import { Session } from "@/lib/pictopia/types";
import { SessionTally } from "@/lib/pictopia/sessions";
/** Live kept / set-aside counts for a session; refreshes whenever the library revision changes. */
export function useSessionTally(session: Session | null | undefined, revision: number) {
  const [tally, setTally] = useState<{ id: string; value: SessionTally }>();
  useEffect(() => {
    let mounted = true;
    if (session)
      void repository
        .tally(session)
        .then((value) => {
          if (mounted) setTally({ id: session.id, value });
        })
        .catch(() => {
          /* Keep the last known counts; the next revision retries. */
        });
    return () => {
      mounted = false;
    };
  }, [session?.id, session?.history.length, revision]);
  if (!session) return undefined;
  return tally?.id === session.id
    ? tally.value
    : { reviewed: session.reviewed, kept: session.kept, setAside: session.marked };
}
