/** Copy inside a user gesture; the hardened Electron session denies async clipboard permissions. */
export async function copyText(value: string): Promise<void> {
  const focused = document.activeElement as HTMLElement | null;
  const buffer = document.createElement("textarea");
  buffer.value = value;
  buffer.className = "clipboard-buffer";
  buffer.readOnly = true;
  document.body.append(buffer);
  const setCopyText = (event: ClipboardEvent) => {
    event.clipboardData?.setData("text/plain", value);
    event.preventDefault();
  };
  document.addEventListener("copy", setCopyText);
  try {
    buffer.focus({ preventScroll: true });
    buffer.select();
    buffer.setSelectionRange(0, value.length);
    if (!document.execCommand("copy")) throw Error("COPY_FAILED");
  } finally {
    document.removeEventListener("copy", setCopyText);
    buffer.remove();
    focused?.focus({ preventScroll: true });
  }
}
