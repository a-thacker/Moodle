// A text input with quick-add flag autocomplete. Type a trigger ("-" for
// dates/recurrence, "#" for categories) and a ranked list pops up just above
// the caret; ↑/↓ to choose, ⏎/Tab to insert, Esc to dismiss. The list is
// fixed-positioned so it never gets clipped by a scroll container, and most-
// used flags float to the top (see utils/flags). Drop-in for a plain <input>.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";

import {
  activeFlag,
  applyCompletion,
  bumpFlag,
  suggestFlags,
  type ActiveFlag,
  type FlagDef,
  type Trigger,
} from "../utils/flags";

const POPUP_W = 248;
// Keys handled on keydown while the popup is open — never trigger a refresh on
// their key-up (that would reset the highlighted row back to the top).
const NAV_KEYS = new Set(["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"]);

// Pixel width of `text` in the input's own font — to place the popup at the caret.
let _canvas: HTMLCanvasElement | null = null;
function measure(el: HTMLInputElement, text: string): number {
  _canvas ??= document.createElement("canvas");
  const ctx = _canvas.getContext("2d");
  if (!ctx) return 0;
  const cs = getComputedStyle(el);
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  return ctx.measureText(text).width;
}

export default function FlagInput({
  value,
  onChange,
  triggers = ["-", "#"],
  inputRef,
  onKeyDown,
  placeholder,
  className,
  style,
  spellCheck,
  autoCapitalize,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  triggers?: Trigger[];
  inputRef?: RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  spellCheck?: boolean;
  autoCapitalize?: string;
  autoFocus?: boolean;
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const pendingCaret = useRef<number | null>(null);
  const itemsKey = useRef(""); // identity of the current suggestion set

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FlagDef[]>([]);
  const [sel, setSel] = useState(0);
  const [active, setActive] = useState<ActiveFlag | null>(null);
  const [coords, setCoords] = useState({ left: 0, bottom: 0 });

  const refresh = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? el.value.length;
    const a = activeFlag(el.value, caret, triggers);
    if (!a) {
      setOpen(false);
      itemsKey.current = "";
      return;
    }
    const found = suggestFlags(a.trigger, a.partial, triggers);
    if (!found.length) {
      setOpen(false);
      itemsKey.current = "";
      return;
    }
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const x = (parseFloat(cs.paddingLeft) || 0) + measure(el, el.value.slice(0, a.start)) - el.scrollLeft;
    setCoords({
      left: Math.min(Math.max(rect.left + x, 8), window.innerWidth - POPUP_W - 8),
      bottom: window.innerHeight - rect.top + 6,
    });
    setActive(a);
    // Only reset the highlighted row when the suggestion set actually changes;
    // otherwise a caret move / re-measure would clobber the arrow-key selection.
    const key = found.map((f) => `${f.trigger}${f.token}`).join(",");
    if (key !== itemsKey.current) {
      itemsKey.current = key;
      setItems(found);
      setSel(0);
    }
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers.join("")]);

  // Reposition/close while open if the page moves under it.
  useEffect(() => {
    if (!open) return;
    const onMove = () => refresh();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, refresh]);

  // Restore the caret after a completion changes the controlled value.
  useLayoutEffect(() => {
    if (pendingCaret.current != null && ref.current) {
      const c = pendingCaret.current;
      pendingCaret.current = null;
      ref.current.setSelectionRange(c, c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function complete(flag: FlagDef) {
    const el = ref.current;
    if (!el || !active) return;
    const caret = el.selectionStart ?? el.value.length;
    const next = applyCompletion(el.value, caret, active.start, flag);
    bumpFlag(flag.token);
    pendingCaret.current = next.caret;
    onChange(next.value);
    setOpen(false);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
    refresh();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (open && items.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (s + 1) % items.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (s - 1 + items.length) % items.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); complete(items[sel]); return; }
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    }
    onKeyDown?.(e);
  }

  return (
    <>
      <input
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => { if (!NAV_KEYS.has(e.key)) refresh(); }}
        onClick={refresh}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        className={className}
        style={style}
        spellCheck={spellCheck}
        autoCapitalize={autoCapitalize}
        autoFocus={autoFocus}
      />
      {open && items.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "fixed",
            left: coords.left,
            bottom: coords.bottom,
            width: POPUP_W,
            maxHeight: 260,
            overflowY: "auto",
            overscrollBehavior: "contain",
            background: "#0e0f16",
            border: "1px solid #2b3048",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.55)",
            padding: 5,
            zIndex: 1000,
          }}
        >
          {items.map((f, i) => (
            <button
              key={`${f.trigger}${f.token}`}
              type="button"
              role="option"
              aria-selected={i === sel}
              onMouseDown={(e) => { e.preventDefault(); complete(f); }}
              onMouseEnter={() => setSel(i)}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                width: "100%",
                textAlign: "left",
                border: "none",
                borderRadius: 8,
                padding: "7px 9px",
                cursor: "pointer",
                background: i === sel ? "color-mix(in srgb, var(--cc-accent) 22%, transparent)" : "transparent",
                color: "var(--cc-text)",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--cc-accent-soft)", flexShrink: 0 }}>
                {f.trigger}{f.token}
              </span>
              <span style={{ fontSize: 12.5, color: "var(--cc-muted)", marginLeft: "auto", flexShrink: 0 }}>{f.hint}</span>
            </button>
          ))}
          <div style={{ padding: "5px 9px 3px", fontSize: 10.5, color: "var(--cc-dim)", fontFamily: "var(--font-mono)" }}>
            ↑↓ choose · ⏎ insert · esc
          </div>
        </div>
      )}
    </>
  );
}
