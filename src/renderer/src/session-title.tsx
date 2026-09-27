import { createContext, useCallback, useContext, type ReactNode } from "react";
import { sessionTitle, type TimesheetSummaries } from "@shared/timesheet";
import type { ScreenTimeSessionBlock } from "@shared/types";

const SessionTitleContext = createContext<TimesheetSummaries>({});

export function SessionTitleProvider({ value, children }: { value: TimesheetSummaries | undefined; children: ReactNode }) {
  return <SessionTitleContext.Provider value={value ?? {}}>{children}</SessionTitleContext.Provider>;
}

export function useSessionTitle(): (block: ScreenTimeSessionBlock) => string {
  const summaries = useContext(SessionTitleContext);
  return useCallback((block: ScreenTimeSessionBlock) => sessionTitle(block, summaries), [summaries]);
}
