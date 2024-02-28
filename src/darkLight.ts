export function initDarkLightMode() {
  const darkModePreference = window.matchMedia("(prefers-color-scheme: dark)");
  setDarkLightMode(darkModePreference.matches);
  darkModePreference.addEventListener("change", (e) => setDarkLightMode(e.matches));
}

export function setDarkLightMode(dark: boolean) {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function toggleDarkLightMode() {
  const dark = document.documentElement.dataset.theme === "dark";
  document.documentElement.setAttribute("data-theme", !dark ? "dark" : "light");
}
