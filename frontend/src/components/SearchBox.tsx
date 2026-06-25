// Buscador con autocompletado: sugerencias en vivo (debounced) + teclado.
import { useEffect, useRef, useState } from "react";
import { api, type SearchResult } from "../api";

interface Props {
  onSelect: (symbol: string) => void;
}

export function SearchBox({ onSelect }: Props) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  // Búsqueda con debounce (250ms). Cada respuesta lleva un id para descartar
  // resultados viejos que lleguen tarde (evita el "bug" de resultados pisados).
  useEffect(() => {
    const q = text.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      return;
    }
    const myId = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { results } = await api.search(q);
        if (myId === reqId.current) {
          setResults(results);
          setOpen(true);
          setActive(-1);
        }
      } catch {
        if (myId === reqId.current) setResults([]);
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [text]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const choose = (symbol: string) => {
    setText("");
    setResults([]);
    setOpen(false);
    setActive(-1);
    onSelect(symbol.toUpperCase());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
      setOpen(true);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && results[active]) choose(results[active].symbol);
      else if (text.trim()) choose(text.trim());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Busca: apple · BTC · S&P · oro · ES=F…"
        spellCheck={false}
        autoComplete="off"
      />
      {loading && <span className="sb-spin" />}
      {open && results.length > 0 && (
        <ul className="sb-list">
          {results.map((r, i) => (
            <li
              key={r.symbol + i}
              className={i === active ? "active" : ""}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r.symbol);
              }}
            >
              <span className="sb-sym">{r.symbol}</span>
              <span className="sb-name">{r.name}</span>
              {r.exchange && <span className="sb-exch">{r.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
