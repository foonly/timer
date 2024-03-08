import { useTimerStore } from "./timerStore";

export function modalName(id: string, ...name: string[]): string {
  return `${id}:${name.join("//")}`;
}

export const tagName = (id: string) => {
  return id.split("//").at(-1);
};

export const intervalHandle = setInterval(() => {
  const timerStore = useTimerStore();
  timerStore.now = Date.now();
}, 1000);
