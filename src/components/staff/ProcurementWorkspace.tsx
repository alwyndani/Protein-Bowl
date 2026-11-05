import React, { useState } from 'react';
import { Package } from 'lucide-react';
import { ProcurementService, type Branch, type PurchaseOrder } from '../../services/procurementService';
import { Card, Field, Notice, btnCls, errorText, ghostBtnCls, inputCls, useLoad } from './staffUi';

type Tab = 'dashboard' | 'stock' | 'suppliers' | 'orders';
const TABS: Array<[Tab, string]> = [['dashboard', 'Dashboard'], ['stock', 'Stock'], ['suppliers', 'Suppliers'], ['orders', 'Purchase orders']];

/** Runs an action, surfaces failure, and reloads on success. */
function useAction(after: () => void) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    if (busy) return false;
    setBusy(true);
    setOk(null);
    try { await fn(); setError(null); setOk(message); after(); return true; } catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); }
  };
  return { run, error, ok, busy };
}

const Dashboard: React.FC<{ branchId: string }> = ({ branchId }) => {
  const d = useLoad(() => ProcurementService.dashboard(branchId), [branchId]);
  if (d.loading) return <p className="text-sm text-stone-400">Loading…</p>;
  if (!d.data) return <Notice error={d.error} />;
  const o = d.data.openOrders;
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title="Overview">
        <p className="text-sm">{d.data.itemCount} stock items</p>
        <p className="text-sm">{d.data.movementsLast7Days} stock movements in the last 7 days</p>
        <p className="text-sm">Open orders — draft {o.DRAFT ?? 0}, ordered {o.ORDERED ?? 0}, partly received {o.PARTIALLY_RECEIVED ?? 0}</p>
      </Card>
      <Card title="Low stock">
        {d.data.lowStock.length === 0 && <p className="text-xs text-stone-400">Nothing is below its reorder level.</p>}
        <ul className="text-xs space-y-1">{d.data.lowStock.map((i) => <li key={i.id}>{i.name}: <b>{i.quantityOnHand}</b> {i.unit} (reorder at {i.minReorderLevel})</li>)}</ul>
      </Card>
      <Card title="Expiring within 7 days">
        {d.data.expiringSoon.length === 0 && <p className="text-xs text-stone-400">Nothing expiring soon.</p>}
        <ul className="text-xs space-y-1">{d.data.expiringSoon.map((i) => <li key={i.id}>{i.name}: {i.expiryDate ? new Date(i.expiryDate).toLocaleDateString() : ''}</li>)}</ul>
      </Card>
    </div>
  );
};

const Stock: React.FC<{ branchId: string }> = ({ branchId }) => {
  const items = useLoad(() => ProcurementService.items(branchId), [branchId]);
  const act = useAction(() => void items.reload());
  const [f, setF] = useState({ name: '', sku: '', category: '', unit: 'kg', minReorderLevel: '10', unitCost: '0' });
  const [adj, setAdj] = useState<{ id: string; type: string; quantity: string; notes: string } | null>(null);
  return (
    <div className="space-y-4">
      <Card title="Add stock item">
        <form className="grid sm:grid-cols-6 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void act.run(() => ProcurementService.createItem({ branchId, name: f.name, sku: f.sku, category: f.category, unit: f.unit, minReorderLevel: Number(f.minReorderLevel), unitCost: Number(f.unitCost) }), 'Item added'); }}>
          <Field label="Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="SKU"><input required className={inputCls} value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} /></Field>
          <Field label="Category"><input required className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <Field label="Unit"><input required className={inputCls} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
          <Field label="Reorder at"><input required type="number" min={0} className={inputCls} value={f.minReorderLevel} onChange={(e) => setF({ ...f, minReorderLevel: e.target.value })} /></Field>
          <Field label="Unit cost (₹)"><input required type="number" min={0} step="0.01" className={inputCls} value={f.unitCost} onChange={(e) => setF({ ...f, unitCost: e.target.value })} /></Field>
          <button className={btnCls} disabled={act.busy}>Add item</button>
        </form>
        <Notice error={act.error} ok={act.ok} />
      </Card>
      <Card title="Stock on hand">
        <Notice error={items.error} />
        {items.data?.length === 0 && <p className="text-xs text-stone-400">No stock items yet.</p>}
        <table className="w-full text-xs"><thead className="text-stone-500 text-left"><tr><th>Item</th><th>SKU</th><th>On hand</th><th>Reorder at</th><th /></tr></thead>
          <tbody>{items.data?.map((i) => (
            <React.Fragment key={i.id}>
              <tr className="border-t border-stone-800"><td className="py-1">{i.name}</td><td>{i.sku}</td><td className={i.quantityOnHand <= i.minReorderLevel ? 'text-amber-300 font-bold' : ''}>{i.quantityOnHand} {i.unit}</td><td>{i.minReorderLevel}</td>
                <td className="text-right"><button className={ghostBtnCls} onClick={() => setAdj({ id: i.id, type: 'WASTAGE', quantity: '', notes: '' })}>Adjust</button></td></tr>
              {adj?.id === i.id && (
                <tr><td colSpan={5} className="py-2">
                  <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void act.run(() => ProcurementService.stockMovement({ inventoryItemId: i.id, type: adj.type, quantity: Number(adj.quantity), unitCost: Number(i.unitCost), notes: adj.notes || undefined }), 'Stock updated').then((okd) => okd && setAdj(null)); }}>
                    <select className={inputCls + ' w-auto'} value={adj.type} onChange={(e) => setAdj({ ...adj, type: e.target.value })}>
                      <option value="WASTAGE">Wastage</option><option value="PRODUCTION_CONSUMPTION">Used in production</option><option value="TRANSFER_OUT">Transfer out</option><option value="TRANSFER_IN">Transfer in</option>
                    </select>
                    <input required type="number" min="0.001" step="any" placeholder="Quantity" className={inputCls + ' w-28'} value={adj.quantity} onChange={(e) => setAdj({ ...adj, quantity: e.target.value })} />
                    <input placeholder="Note" maxLength={300} className={inputCls + ' w-48'} value={adj.notes} onChange={(e) => setAdj({ ...adj, notes: e.target.value })} />
                    <button className={btnCls} disabled={act.busy}>Record</button><button type="button" className={ghostBtnCls} onClick={() => setAdj(null)}>Cancel</button>
                  </form>
                </td></tr>
              )}
            </React.Fragment>
          ))}</tbody></table>
      </Card>
    </div>
  );
};

const Suppliers: React.FC = () => {
  const list = useLoad(() => ProcurementService.suppliers(), []);
  const act = useAction(() => void list.reload());
  const [f, setF] = useState({ name: '', contactName: '', email: '', phone: '' });
  const opt = (v: string) => v.trim() || undefined;
  return (
    <div className="space-y-4">
      <Card title="Add supplier">
        <form className="grid sm:grid-cols-5 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); void act.run(() => ProcurementService.createSupplier({ name: f.name, contactName: opt(f.contactName), email: opt(f.email), phone: opt(f.phone) }), 'Supplier added').then((okd) => okd && setF({ name: '', contactName: '', email: '', phone: '' })); }}>
          <Field label="Name"><input required className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Contact"><input className={inputCls} value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <button className={btnCls} disabled={act.busy}>Add supplier</button>
        </form>
        <Notice error={act.error} ok={act.ok} />
      </Card>
      <Card title="Suppliers">
        <Notice error={list.error} />
        <ul className="text-sm divide-y divide-stone-800">{list.data?.map((s) => (
          <li key={s.id} className="py-2 flex items-center justify-between gap-2"><span>{s.name} <span className="text-xs text-stone-500">{[s.contactName, s.email, s.phone].filter(Boolean).join(' · ')}</span>{!s.isActive && <b className="ml-2 text-xs text-stone-500">inactive</b>}</span>
            <button className={ghostBtnCls} onClick={() => void act.run(() => ProcurementService.setSupplierActive(s.id, !s.isActive), s.isActive ? 'Supplier deactivated' : 'Supplier activated')}>{s.isActive ? 'Deactivate' : 'Activate'}</button></li>
        ))}</ul>
      </Card>
    </div>
  );
};

const Receive: React.FC<{ po: PurchaseOrder; onDone: () => void }> = ({ po, onDone }) => {
  const [q, setQ] = useState<Record<string, string>>({});
  const act = useAction(onDone);
  const lines = Object.entries(q).filter(([, v]) => Number(v) > 0).map(([id, v]) => ({ purchaseOrderLineId: id, quantity: Number(v) }));
  return (
    <div className="space-y-2">
      {po.lines.map((l) => {
        const left = Math.max(0, Math.round((l.orderedQuantity - l.receivedQuantity) * 1000) / 1000);
        return <div key={l.id} className="flex items-center gap-2 text-xs"><span className="flex-1">{l.inventoryItem.name} — outstanding {left} {l.inventoryItem.unit}</span>
          <input type="number" min="0" max={left} step="any" disabled={left === 0} placeholder="Received now" className={inputCls + ' w-32'} value={q[l.id] ?? ''} onChange={(e) => setQ({ ...q, [l.id]: e.target.value })} /></div>;
      })}
      <button className={btnCls} disabled={act.busy || lines.length === 0} onClick={() => void act.run(() => ProcurementService.receive(po.id, lines), 'Goods received and stock updated')}>Record goods receipt</button>
      <Notice error={act.error} ok={act.ok} />
    </div>
  );
};

const Orders: React.FC<{ branchId: string }> = ({ branchId }) => {
  const orders = useLoad(() => ProcurementService.orders(branchId), [branchId]);
  const suppliers = useLoad(() => ProcurementService.suppliers(), []);
  const items = useLoad(() => ProcurementService.items(branchId), [branchId]);
  const act = useAction(() => void orders.reload());
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState({ supplierId: '', itemId: '', quantity: '', cost: '' });
  const [draftLines, setDraftLines] = useState<Array<{ inventoryItemId: string; orderedQuantity: number; unitCost: number }>>([]);
  const nameOf = (id: string) => items.data?.find((i) => i.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <Card title="New purchase order">
        <div className="grid sm:grid-cols-5 gap-2 items-end">
          <Field label="Supplier"><select className={inputCls} value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })}><option value="">Choose…</option>{suppliers.data?.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Item"><select className={inputCls} value={f.itemId} onChange={(e) => { const it = items.data?.find((i) => i.id === e.target.value); setF({ ...f, itemId: e.target.value, cost: it ? it.unitCost : f.cost }); }}><option value="">Choose…</option>{items.data?.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
          <Field label="Quantity"><input type="number" min="0.001" step="any" className={inputCls} value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
          <Field label="Unit cost (₹)"><input type="number" min="0" step="0.01" className={inputCls} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} /></Field>
          <button className={ghostBtnCls} disabled={!f.itemId || !(Number(f.quantity) > 0) || f.cost === '' || draftLines.some((l) => l.inventoryItemId === f.itemId)} onClick={() => { setDraftLines([...draftLines, { inventoryItemId: f.itemId, orderedQuantity: Number(f.quantity), unitCost: Number(f.cost) }]); setF({ ...f, itemId: '', quantity: '', cost: '' }); }}>Add line</button>
        </div>
        <ul className="text-xs text-stone-300">{draftLines.map((l) => <li key={l.inventoryItemId}>{nameOf(l.inventoryItemId)} × {l.orderedQuantity} @ ₹{l.unitCost} <button className="underline ml-2" onClick={() => setDraftLines(draftLines.filter((x) => x !== l))}>remove</button></li>)}</ul>
        <button className={btnCls} disabled={act.busy || !f.supplierId || draftLines.length === 0} onClick={() => void act.run(() => ProcurementService.createOrder({ branchId, supplierId: f.supplierId, lines: draftLines }), 'Draft purchase order created').then((okd) => okd && setDraftLines([]))}>Create draft</button>
        <Notice error={act.error} ok={act.ok} />
      </Card>
      <Card title="Purchase orders">
        <Notice error={orders.error} />
        {orders.data?.length === 0 && <p className="text-xs text-stone-400">No purchase orders yet.</p>}
        {orders.data?.map((po) => (
          <div key={po.id} className="border border-stone-800 rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><b className="text-sm">{po.poNumber}</b><span className="text-xs text-stone-400">{po.supplier.name} · {po.status}</span></div>
            <ul className="text-xs text-stone-300">{po.lines.map((l) => <li key={l.id}>{l.inventoryItem.name}: {l.receivedQuantity}/{l.orderedQuantity} {l.inventoryItem.unit} @ ₹{l.unitCost}</li>)}</ul>
            <div className="flex flex-wrap gap-2">
              {po.status === 'DRAFT' && <button className={btnCls} disabled={act.busy} onClick={() => void act.run(() => ProcurementService.orderAction(po.id, 'order'), 'Order sent to supplier')}>Send to supplier</button>}
              {(po.status === 'DRAFT' || po.status === 'ORDERED') && <button className={ghostBtnCls} disabled={act.busy} onClick={() => void act.run(() => ProcurementService.orderAction(po.id, 'cancel'), 'Order cancelled')}>Cancel</button>}
              {(po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') && <button className={ghostBtnCls} onClick={() => setOpen(open === po.id ? null : po.id)}>Receive goods</button>}
            </div>
            {open === po.id && <Receive po={po} onDone={() => { setOpen(null); void orders.reload(); void items.reload(); }} />}
          </div>
        ))}
      </Card>
    </div>
  );
};

/** Procurement workspace: real API data only; every write is branch-authorized by the server. */
export const ProcurementWorkspace: React.FC = () => {
  const branches = useLoad(() => ProcurementService.myBranches(), []);
  const [branchId, setBranchId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const list: Branch[] = branches.data ?? [];
  const active = branchId || list[0]?.id || '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 text-white space-y-4" data-testid="procurement-workspace">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex items-center gap-2"><Package className="w-6 h-6 text-amber-400" aria-hidden="true" />Procurement</h1>
        {list.length > 1 && <select aria-label="Branch" className={inputCls + ' w-auto'} value={active} onChange={(e) => setBranchId(e.target.value)}>{list.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
      </div>
      <Notice error={branches.error} />
      {!branches.loading && list.length === 0 && !branches.error && <p className="text-sm text-stone-400">You are not assigned to a branch yet. Ask a Super Admin to assign one.</p>}
      {active && (
        <>
          <div role="tablist" className="flex flex-wrap gap-2">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`${tab === id ? 'bg-amber-500 text-stone-950' : 'bg-stone-900 text-stone-300'} text-xs font-black rounded-lg px-3 py-2`} onClick={() => setTab(id)}>{label}</button>)}</div>
          {tab === 'dashboard' && <Dashboard branchId={active} />}
          {tab === 'stock' && <Stock branchId={active} />}
          {tab === 'suppliers' && <Suppliers />}
          {tab === 'orders' && <Orders branchId={active} />}
        </>
      )}
    </div>
  );
};
