import type { AppSnapshot } from "@shared/snapshot";
import { X } from "lucide-react";
import { IconButton } from "../ui";

export function ReviewEntriesBar({
  state,
  onOpen,
}: {
  state: AppSnapshot;
  onOpen: () => void;
}) {
  if (!state.calendarReviewVisible) return null;
  const count = state.calendarDayStats.reviewCount;
  return (
    <div className="calendar-review-bar">
      <button type="button" className="calendar-review-pill" onClick={onOpen}>
        Review Time Entries
        <span className="calendar-review-count">{count}</span>
      </button>
      <IconButton
        label="Dismiss review reminder"
        icon={X}
        onClick={() => window.stopscrolling.dismissCalendarReview(state.calendarDayStats.unlabeledBlocks.map((block) => block.id))}
      />
    </div>
  );
}
