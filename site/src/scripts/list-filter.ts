// In-place filtering for the category (by tag) and timeline (by category) lists.
//
// [data-filter-root]            wraps the chips, the list and the sidebar bars
//   [data-filter="value"]       chip; "" means all
//   [data-group="2020"]         year group, hidden when empty
//     [data-group-count]        "3 entries"
//     [data-values="a|b"]       list item
//   [data-shown]                "Showing n / m"
//   [data-shown-count]          big numeral
//   [data-bar="2020"]           year bar, recomputed when the root has data-bars="shown"

import { scrollSpy } from "./scroll-spy";

function initFilters() {
  document.querySelectorAll<HTMLElement>("[data-filter-root]").forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = "true";

    const chips = [...root.querySelectorAll<HTMLButtonElement>("[data-filter]")];
    const items = [...root.querySelectorAll<HTMLElement>("[data-values]")];
    const groups = [...root.querySelectorAll<HTMLElement>("[data-group]")];
    const total = items.length;
    let current = "";

    const apply = (value: string) => {
      current = value;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === value)));

      const perGroup: Record<string, number> = {};
      let shown = 0;
      for (const item of items) {
        const ok = !value || item.dataset.values!.split("|").includes(value);
        item.hidden = !ok;
        if (!ok) continue;
        shown++;
        const g = item.closest<HTMLElement>("[data-group]")?.dataset.group;
        if (g) perGroup[g] = (perGroup[g] ?? 0) + 1;
      }

      for (const g of groups) {
        const n = perGroup[g.dataset.group!] ?? 0;
        g.hidden = n === 0;
        const label = g.querySelector("[data-group-count]");
        if (label) label.textContent = `${n} ${n === 1 ? "entry" : "entries"}`;
      }
      root.querySelectorAll("[data-shown]").forEach((e) => (e.textContent = `Showing ${shown} / ${total}`));
      root.querySelectorAll("[data-shown-count]").forEach((e) => (e.textContent = String(shown).padStart(2, "0")));

      if (root.dataset.bars === "shown") {
        const max = Math.max(1, ...Object.values(perGroup));
        root.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar) => {
          const n = perGroup[bar.dataset.bar!] ?? 0;
          bar.hidden = n === 0;
          bar.querySelector<HTMLElement>("[data-bar-fill]")!.style.width = `${Math.round((n / max) * 100)}%`;
          bar.querySelector("[data-bar-count]")!.textContent = String(n);
        });
      }
      root.dispatchEvent(new CustomEvent("filterchange"));
    };

    chips.forEach((chip) =>
      chip.addEventListener("click", () => {
        const v = chip.dataset.filter ?? "";
        apply(v && v === current ? "" : v);
      }),
    );

    // Timeline: the year list in the sidebar follows the year in view.
    const jumps = [...root.querySelectorAll<HTMLAnchorElement>("a.year-bar")];
    if (jumps.length) {
      const spy = scrollSpy(jumps, (activeLink) => jumps.forEach((j) => j.setAttribute("aria-current", String(j === activeLink))));
      root.addEventListener("filterchange", () => spy.update());
    }
  });
}

document.addEventListener("astro:page-load", initFilters);
