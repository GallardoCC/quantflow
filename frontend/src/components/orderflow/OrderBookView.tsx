import type { OFOrderBook2 } from "../../api";

/** Escalera de profundidad (DOM): asks arriba (rojo), bids abajo (verde), con
 *  depth bars proporcionales al size y órdenes grandes resaltadas. */
export function OrderBookView({ ob }: { ob: OFOrderBook2 }) {
  const asks = ob.asks.slice(0, 16).reverse(); // mejor ask cerca del spread (abajo)
  const bids = ob.bids.slice(0, 16);
  const maxSize = Math.max(...asks.map((a) => a.size), ...bids.map((b) => b.size), 1);
  const large = new Set(ob.largeOrders.map((o) => o.price + ":" + o.side));

  const Row = ({ price, size, side }: { price: number; size: number; side: "bid" | "ask" }) => {
    const w = (size / maxSize) * 100;
    const big = large.has(price + ":" + side);
    return (
      <div className={`ofx-dom-row ${side} ${big ? "big" : ""}`}>
        <div className="ofx-dom-bar" style={{ width: `${w}%` }} />
        <span className="ofx-dom-price">{price}</span>
        <span className="ofx-dom-size">{size.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
        {big && <span className="ofx-dom-flag">●</span>}
      </div>
    );
  };

  return (
    <div className="ofx-dom">
      <div className="ofx-dom-side asks">
        {asks.map((a, i) => <Row key={"a" + i} price={a.price} size={a.size} side="ask" />)}
      </div>
      <div className="ofx-dom-mid">
        <span className="ofx-dom-midprice">{ob.midPrice}</span>
        <span className="ofx-dom-spread">spread {ob.spread != null ? ob.spread : "—"}</span>
      </div>
      <div className="ofx-dom-side bids">
        {bids.map((b, i) => <Row key={"b" + i} price={b.price} size={b.size} side="bid" />)}
      </div>
      {ob.largeOrders.length > 0 && (
        <div className="ofx-legend" style={{ marginTop: 12 }}>
          <span>● órdenes grandes detectadas: {ob.largeOrders.length}</span>
        </div>
      )}
    </div>
  );
}
