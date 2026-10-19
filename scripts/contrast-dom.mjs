// Runs inside the actual Electron renderer. No theme-token assumptions.
export function collectContrast() {
  const parse = (s) => {
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (!m) throw Error(`Unsupported color: ${s}`);
    const v = m[1].split(",").map(Number);
    return [...v.slice(0, 3), v[3] ?? 1];
  };
  const rows = [];
  const modal = [...document.querySelectorAll("dialog[open]")].at(-1);
  for (const el of (modal ?? document.body).querySelectorAll("*")) {
    const cs = getComputedStyle(el),
      rect = el.getBoundingClientRect();
    if (
      !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ||
      !rect.width ||
      !rect.height ||
      cs.clip !== "auto" ||
      el.closest('[aria-hidden="true"]') ||
      el.matches("option,script,style")
    )
      continue;
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
      .trim();
    const value = el.matches("input,textarea")
      ? el.value
      : el.matches("select")
        ? [...el.selectedOptions].map((o) => o.text).join(", ")
        : "";
    const placeholder =
      el.matches("input,textarea") && !el.value
        ? el.getAttribute("placeholder")
        : "";
    for (const [kind, label, style] of [
      ["text", text || value, cs],
      [
        "placeholder",
        placeholder,
        placeholder ? getComputedStyle(el, "::placeholder") : cs,
      ],
    ]) {
      if (!label) continue;
      const layers = [],
        unsupported = [];
      for (let node = el; node; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (
          s.backgroundImage !== "none" ||
          s.filter !== "none" ||
          s.backdropFilter !== "none" ||
          s.mixBlendMode !== "normal" ||
          s.textShadow !== "none"
        )
          unsupported.push(`${node.tagName}: complex paint`);
        layers.push({
          background: parse(s.backgroundColor),
          opacity: Number(s.opacity),
        });
      }
      if (kind === "placeholder" && Number(style.opacity) !== 1)
        layers.unshift({
          background: [0, 0, 0, 0],
          opacity: Number(style.opacity),
        });
      rows.push({
        selector: el.id
          ? `#${el.id}`
          : `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`,
        kind,
        text: label.slice(0, 160),
        size: parseFloat(style.fontSize),
        weight: parseInt(style.fontWeight) || 400,
        color: parse(style.color),
        layers,
        disabled: !!el.closest(":disabled"),
        unsupported,
      });
    }
  }
  return rows;
}
