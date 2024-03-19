import { useTimerStore } from "./timerStore";

export function modalName(id: string, ...name: string[]): string {
  return `${id}:${name.join("//")}`;
}

export const tagName = (id: string) => {
  return id.split("//").at(-1);
};

let intervalHandle = 0;

export function startInterval() {
  if (intervalHandle > 0) {
    clearInterval(intervalHandle);
  }
  intervalHandle = setInterval(() => {
    const timerStore = useTimerStore();
    timerStore.now = Date.now();
  }, 1000);
}

export function getDayNumber(offset=4, time = Date.now()) {
  const date = new Date(time);
  const sub = (date.getHours() < offset)? 1:0;
  date.setHours(0);
  const zero = new Date("2024-01-01");
  const diff = date.getTime() - zero.getTime();
  const days = Math.round(diff / (1000*3600*24));
  return days - sub;
}

export function getTimeFromDays(days: number,offset=4) {
  const date = new Date("2024-01-01");
  date.setDate(date.getDate()+days);
  return date.getTime() + (offset * 3600 * 1000);
}