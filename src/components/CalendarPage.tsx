import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { dateKeyFromValue, localDateKey } from "../dates";
import type { CalendarEvent } from "../types";

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
});
const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

export default function CalendarPage({
  events,
  weekStartsOn,
  onAdd,
  onEdit,
  onDelete,
}: {
  events: CalendarEvent[];
  weekStartsOn: string;
  onAdd: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const startsMonday = weekStartsOn === "Monday";
  const firstDay = new Date(year, month, 1).getDay();
  const offset = startsMonday ? (firstDay + 6) % 7 : firstDay;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from(
    { length: Math.ceil((offset + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - offset + 1;
      return day > 0 && day <= daysInMonth ? new Date(year, month, day) : null;
    },
  );
  const headers = startsMonday
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayKey = localDateKey();
  const eventsByDate = useMemo(
    () =>
      events.reduce<Record<string, CalendarEvent[]>>((groups, event) => {
        const key = dateKeyFromValue(event.event_date);
        groups[key] = [...(groups[key] || []), event];
        return groups;
      }, {}),
    [events],
  );
  const moveMonth = (amount: number) =>
    setVisibleMonth(new Date(year, month + amount, 1));
  const monthEvents = events.filter(
    (event) =>
      dateKeyFromValue(event.event_date).slice(0, 7) ===
      `${year}-${String(month + 1).padStart(2, "0")}`,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Planning calendar</p>
          <h1>See the month clearly.</h1>
          <p className="subheading">
            Income, bills, investments, and goals in one moving calendar.
          </p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> Add event
        </button>
      </div>
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <button
            className="icon-button"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <strong>{monthFormatter.format(visibleMonth)}</strong>
          <button
            className="icon-button"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="select-button"
            onClick={() => setVisibleMonth(new Date())}
          >
            Today <ChevronDown size={14} />
          </button>
        </div>
        <div className="calendar-meta">
          <span>
            <CalendarDays size={14} /> {monthEvents.length} event
            {monthEvents.length === 1 ? "" : "s"} this month
          </span>
          <span>{events.length} total saved</span>
        </div>
        <div className="calendar-grid">
          <div className="calendar-week">
            {headers.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-days">
            {cells.map((date, index) => {
              const key = date ? localDateKey(date) : null;
              const dayEvents = key ? eventsByDate[key] || [] : [];
              return (
                <div
                  className={`calendar-day ${key === todayKey ? "today" : ""} ${date ? "" : "outside-month"}`}
                  key={key || `empty-${index}`}
                >
                  {date && (
                    <>
                      <strong>{date.getDate()}</strong>
                      {dayEvents.map((event) => (
                        <button
                          key={event.id ?? `${event.title}-${event.event_date}`}
                          className={`calendar-event ${event.event_type.toLowerCase()}`}
                          onClick={() => setSelected(event)}
                        >
                          {event.title}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div
            className="quick-modal event-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">{selected.event_type}</span>
                <h2>{selected.title}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <p className="event-detail-meta">
              {dayFormatter.format(new Date(`${selected.event_date}T12:00:00`))}
              {selected.amount
                ? ` · ${selected.amount}`
                : ""}
              {selected.notes ? ` · ${selected.notes}` : ""}
            </p>
            <div className="event-detail-actions">
              <button
                className="secondary-button"
                onClick={() => {
                  onEdit(selected);
                  setSelected(null);
                }}
              >
                <Pencil size={16} /> Edit
              </button>
              <button
                className="secondary-button danger-button"
                onClick={() => {
                  if (window.confirm(`Delete “${selected.title}”?`)) {
                    onDelete(selected);
                    setSelected(null);
                  }
                }}
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
