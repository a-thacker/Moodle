// Live clock + greeting/date, ported from the mockups' renderVals()/tick().
// Ticks once a second; returns strings the header and hero render.

import { useEffect, useState } from "react";

const DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface ClockValues {
  hm: string; // "9:07"
  ampm: string; // "AM" | "PM"
  dateLong: string; // "Monday, July 13"
  greeting: string; // "Good morning" | ...
}

function compute(now: Date): ClockValues {
  const h = now.getHours();
  const m = now.getMinutes();
  const h12 = ((h + 11) % 12) + 1;
  return {
    hm: `${h12}:${String(m).padStart(2, "0")}`,
    ampm: h < 12 ? "AM" : "PM",
    dateLong: `${DAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`,
    greeting: h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
  };
}

export function useClock(): ClockValues {
  const [values, setValues] = useState<ClockValues>(() => compute(new Date()));
  useEffect(() => {
    const id = setInterval(() => setValues(compute(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return values;
}
