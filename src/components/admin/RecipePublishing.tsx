import React, { useState } from 'react';
import { RecipeService } from '../../services/recipeService';
import { Card, Notice, btnCls, errorText, ghostBtnCls, useLoad } from '../staff/staffUi';

/** SUPER_ADMIN: Chefs create recipes as drafts; only a published recipe is visible to customers. The server decides (SUPER_ADMIN only). */
export const RecipePublishing: React.FC = () => {
  const list = useLoad(() => RecipeService.getStaffRecipes({ limit: 100 }), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});

  const toggle = async (id: string, name: string, next: boolean) => {
    if (busyId) return;
    setBusyId(id);
    setMsg({});
    try {
      await RecipeService.publishRecipe(id, next);
      setMsg({ ok: `${name} ${next ? 'published' : 'unpublished'}.` });
      await list.reload(); // show what the server stored
    } catch (e) {
      setMsg({ error: errorText(e) });
    } finally {
      setBusyId(null);
    }
  };

  const items = list.data?.items ?? [];
  const drafts = items.filter((r) => !r.isPublished);
  const published = items.filter((r) => r.isPublished);

  const row = (r: (typeof items)[number], next: boolean) => (
    <li key={r.id} className="py-2 flex items-center justify-between gap-3">
      <span className="text-sm">{r.name} <b className="text-xs text-stone-500">{r.category} · {r.calories} kcal</b></span>
      <button className={next ? btnCls : ghostBtnCls} disabled={busyId !== null} onClick={() => void toggle(r.id, r.name, next)}>
        {busyId === r.id ? 'Saving…' : next ? 'Publish' : 'Unpublish'}
      </button>
    </li>
  );

  return (
    <div className="space-y-4 text-white" data-testid="recipe-publishing">
      <Notice error={list.error ?? msg.error} ok={msg.ok} />
      <Card title={`Drafts awaiting publication (${drafts.length})`}>
        {list.loading && <p className="text-xs text-stone-400">Loading…</p>}
        {!list.loading && drafts.length === 0 && <p className="text-xs text-stone-400">No drafts.</p>}
        <ul className="divide-y divide-stone-800">{drafts.map((r) => row(r, true))}</ul>
      </Card>
      <Card title={`Published (${published.length})`}>
        <ul className="divide-y divide-stone-800">{published.map((r) => row(r, false))}</ul>
      </Card>
      {list.data && list.data.total > items.length && <p className="text-xs text-stone-400">Showing the first {items.length} of {list.data.total} recipes.</p>}
    </div>
  );
};
