import { createContext, useContext, type ReactNode } from "react";
import { clockFormatOf } from "@shared/timeline";
import type { ClockFormat } from "@shared/types";

const ClockFormatContext = createContext<ClockFormat>("24");

export function ClockFormatProvider({ value, children }: { value: unknown; children: ReactNode }) {
  return <ClockFormatContext.Provider value={clockFormatOf(value)}>{children}</ClockFormatContext.Provider>;
}

export function useClockFormat(): ClockFormat {
  return useContext(ClockFormatContext);
}
