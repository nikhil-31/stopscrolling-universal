export function openDay(day: Date) {
  const iso = day.toISOString();
  window.stopscrolling.setCalendarAnchor(iso);
  window.stopscrolling.setCalendarMonth(iso);
  window.stopscrolling.setCalendarView("day");
}
