import {
  CarbonContext,
  type ICarbonStore,
  setCarbonHmrStore,
  useInterval
} from "@carbon/react";
import { isBrowser } from "@carbon/utils";
import type React from "react";
import type { PropsWithChildren } from "react";
import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import type { StoreApi } from "zustand";
import { createStore, useStore } from "zustand";
import type { AuthSession } from "../../types";
import { path } from "../../utils/path";
import { createCarbonWithAuthGetter } from "./client";

export { useCarbon } from "@carbon/react";

export const CarbonProvider = ({
  children,
  session
}: PropsWithChildren<{
  session: Partial<AuthSession>;
}>) => {
  const store = useRef<StoreApi<ICarbonStore>>(
    null
  ) as React.MutableRefObject<StoreApi<ICarbonStore> | null>;

  if (!store.current) {
    store.current = createStore<ICarbonStore>((set, get) => ({
      accessToken: session.accessToken ?? "",
      isRealtimeAuthSet: false,
      carbon: createCarbonWithAuthGetter(
        store as React.MutableRefObject<StoreApi<{ accessToken: string }>>
      ),
      setAuthToken: async (accessToken) => {
        const { carbon } = get();

        await carbon.realtime.setAuth(accessToken);

        set({ accessToken, isRealtimeAuthSet: true });
      }
    }));
    // Keep a module-level reference for HMR recovery
    setCarbonHmrStore(store.current);
  }

  const { carbon, setAuthToken } = useStore<StoreApi<ICarbonStore>>(
    store.current!
  );

  const initialLoad = useRef(true);
  const refresh = useFetcher<{}>();
  // Debounce concurrent visibility + interval submits. Parallel refresh_token
  // grants rotate/revoke each other and can clear the session cookie.
  const lastRefreshSubmitAt = useRef(0);
  const refreshFetcherRef = useRef(refresh);
  refreshFetcherRef.current = refresh;
  const expiresAtRef = useRef(session.expiresAt ?? 0);
  expiresAtRef.current = session.expiresAt ?? 0;
  const REFRESH_DEBOUNCE_MS = 5_000;

  const trySubmitRefresh = () => {
    const fetcher = refreshFetcherRef.current;
    if (fetcher.state !== "idle") return;
    const now = Date.now();
    if (now - lastRefreshSubmitAt.current < REFRESH_DEBOUNCE_MS) return;
    lastRefreshSubmitAt.current = now;
    fetcher.submit(null, {
      method: "post",
      action: path.to.refreshSession
    });
  };

  // Access tokens last hours (often 1h, optionally 24h). Only hit
  // `/refresh-session` when we are inside the same 10-minute window the
  // interval uses — a phone PWA `/shop` focus must not mint a new token
  // on every app switch (that races refresh_token rotation → login).
  const isExpiringSoon = () =>
    expiresAtRef.current - 60 * 10 < Date.now() / 1000;

  // biome-ignore lint/correctness/useExhaustiveDependencies: suppressed due to migration
  useEffect(() => {
    if (session.accessToken) {
      setAuthToken(session.accessToken);
    }
  }, [carbon, setAuthToken, session.accessToken]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trySubmitRefresh is ref-backed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isExpiringSoon()) {
        trySubmitRefresh();
      }
    };

    if (isBrowser) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      if (isBrowser) {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      }
    };
  }, []);

  useInterval(() => {
    // refresh ten minutes before expiry
    const shouldRefresh = isExpiringSoon();
    const shouldReload = expiresAtRef.current < Date.now() / 1000;

    if (shouldReload) {
      window.location.reload();
    }

    if (!initialLoad.current && shouldRefresh && carbon) {
      trySubmitRefresh();
    }

    initialLoad.current = false;
  }, 60000); // Check every minute

  return (
    <CarbonContext.Provider value={store.current}>
      {children}
    </CarbonContext.Provider>
  );
};
