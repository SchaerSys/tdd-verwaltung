"use client";

export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    let cur = root.getAttribute("data-theme");
    if (!cur) cur = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.setAttribute("data-theme", cur === "dark" ? "light" : "dark");
  }
  return (
    <button className="theme-btn" onClick={toggle} aria-label="Farbschema wechseln" type="button">
      ◐ Theme
    </button>
  );
}
