export function modalName(id: string, ...name: string[]): string {
  return `${id}:${name.join("//")}`;
}

export const tagName = (id: string) => {
  return id.split("//").at(-1);
};
