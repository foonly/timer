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
