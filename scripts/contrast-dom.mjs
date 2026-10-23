// Runs inside the actual Electron renderer. No theme-token assumptions.
export function collectContrast() {
  const parse = (s) => {
    const srgb = s.match(/^color\(srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+))?\)$/i);
    if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, Number(srgb[4] ?? 1)];
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (!m) {
      // Chromium may resolve animated color-mix values to OKLab or display-p3.
      // Rasterize the reported CSS color into sRGB instead of assuming its space.
      if (typeof CSS !== "undefined" && CSS.supports("color", s)) {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.fillStyle = s; context.fillRect(0, 0, 1, 1);
        const rgba = context.getImageData(0, 0, 1, 1).data;
        return [rgba[0], rgba[1], rgba[2], rgba[3] / 255];
      }
      throw Error(`Unsupported color: ${s}`);
    }
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
      // xterm's transparent DOM mirror is for assistive technology; visible
      // glyphs are rendered on canvas with minimumContrastRatio: 4.5.
      (el.closest(".xterm-accessibility:not(.debug), .xterm-message") &&
        parse(cs.color)[3] === 0) ||
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
        // An opaque surface covers ancestor gradients/glass. Do not mark
        // readable text on that surface unsupported because of hidden paint.
        if (parse(s.backgroundColor)[3] === 1 && Number(s.opacity) === 1 &&
            s.backgroundImage === "none" && s.filter === "none" &&
            s.mixBlendMode === "normal") break;
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
        color: parse(el.namespaceURI === "http://www.w3.org/2000/svg" && el.tagName === "text" ? style.fill : style.color),
        layers,
        disabled: !!el.closest(":disabled"),
        unsupported,
      });
    }
  }
  return rows;
}
