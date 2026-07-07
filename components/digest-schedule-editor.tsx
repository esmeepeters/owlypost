"use client";

import { useState } from "react";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function DigestScheduleEditor({
  initialSchedule,
}: {
  initialSchedule: {
    frequency: "daily" | "weekly";
    dayOfWeek: number;
    hour: number;
    minute: number;
  };
}) {
  const [frequency, setFrequency] = useState(initialSchedule.frequency);
  const [dayOfWeek, setDayOfWeek] = useState(initialSchedule.dayOfWeek);
  const [time, setTime] = useState(
    `${String(initialSchedule.hour).padStart(2, "0")}:${String(initialSchedule.minute).padStart(2, "0")}`,
  );
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">(
    "idle",
  );

  async function save() {
    const [hour, minute] = time.split(":").map(Number);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      setState("error");
      return;
    }
    setState("busy");
    const response = await fetch("/api/digest-schedule", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frequency, dayOfWeek, hour, minute }),
    }).catch(() => null);
    setState(response?.ok ? "saved" : "error");
  }

  const selectClass =
    "rounded border border-neutral-300 px-3 py-2 text-sm focus:border-accent focus:outline-none";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={frequency}
          onChange={(event) => {
            setFrequency(event.target.value as "daily" | "weekly");
            setState("idle");
          }}
          className={selectClass}
        >
          <option value="weekly">Weekly</option>
          <option value="daily">Daily</option>
        </select>
        {frequency === "weekly" && (
          <select
            value={dayOfWeek}
            onChange={(event) => {
              setDayOfWeek(Number(event.target.value));
              setState("idle");
            }}
            className={selectClass}
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        )}
        <span className="text-sm text-neutral-500">at</span>
        <input
          type="time"
          value={time}
          onChange={(event) => {
            setTime(event.target.value);
            setState("idle");
          }}
          className={selectClass}
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={state === "busy"}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {state === "busy" ? "Saving…" : "Save schedule"}
        </button>
        {state === "saved" && (
          <span className="text-xs text-neutral-500">
            Saved. The worker picks it up within a minute.
          </span>
        )}
        {state === "error" && (
          <span className="text-xs text-red-600">Saving failed.</span>
        )}
      </div>
    </div>
  );
}
