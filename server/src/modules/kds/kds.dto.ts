/**
 * P8 kitchen DTO. Built from EXPLICIT field lists only (never a broad Prisma model with fields deleted afterwards).
 * The kitchen needs to know WHAT to cook and WHEN it was confirmed: nothing about the customer, money, payment, refunds,
 * health, delivery or authentication.
 */
import { Prisma } from '@prisma/client';

export const KITCHEN_STATUSES = ['CONFIRMED', 'ACCEPTED', 'PREPARING', 'READY'] as const;
export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

/** Rows returned per section; `total` / `truncated` tell the UI when more exist. */
export const KITCHEN_SECTION_LIMIT = 100;

/** Prisma `select` for one kitchen order row (the ONLY fields read from the orders/order_items tables for the kitchen). */
export const KITCHEN_ORDER_SELECT = Prisma.validator<Prisma.OrderSelect>()({
  id: true,
  orderNumber: true,
  status: true,
  confirmedAt: true,
  kitchenBranch: { select: { id: true, code: true, name: true } },
  items: {
    select: { id: true, productId: true, recipeId: true, itemTitle: true, variantName: true, sku: true, quantity: true },
    orderBy: [{ itemTitle: 'asc' }, { id: 'asc' }]
  }
});

/** Approved recipe projection: no costing, no prices, no steps, nothing internal. */
export const KITCHEN_RECIPE_SELECT = Prisma.validator<Prisma.RecipeSelect>()({
  id: true,
  title: true,
  servingSize: true,
  prepTimeMins: true,
  cookTimeMins: true,
  chefInstructions: true,
  dietaryTag: true,
  spiceLevel: true
});

export interface KitchenRecipeDto {
  name: string;
  servingSize: string;
  prepTimeMins: number;
  cookTimeMins: number;
  chefInstructions: string | null;
  dietaryTag: string;
  spiceLevel: string | null;
}

export interface KitchenItemDto {
  id: string;
  title: string;
  variantName: string | null;
  sku: string | null;
  quantity: number;
  recipe: KitchenRecipeDto | null;
}

export interface KitchenOrderDto {
  id: string;
  orderNumber: string;
  status: KitchenStatus;
  confirmedAt: string | null;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  serverTime: string;
  branch: { id: string; code: string; name: string } | null;
  items: KitchenItemDto[];
}

export interface KitchenOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  confirmedAt: Date | null;
  kitchenBranch: { id: string; code: string; name: string } | null;
  items: Array<{ id: string; productId: string | null; recipeId: string | null; itemTitle: string; variantName: string | null; sku: string | null; quantity: number }>;
}

export interface KitchenRecipeRow {
  id: string;
  title: string;
  servingSize: string;
  prepTimeMins: number;
  cookTimeMins: number;
  chefInstructions: string | null;
  dietaryTag: string;
  spiceLevel: string | null;
}

export type KitchenEventTimes = Partial<Record<'ACCEPTED' | 'PREPARING' | 'READY', Date>>;

export function toKitchenOrderDto(
  row: KitchenOrderRow,
  events: KitchenEventTimes,
  recipeById: Map<string, KitchenRecipeRow>,
  recipeIdByProductId: Map<string, string | null>,
  serverTime: Date
): KitchenOrderDto {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status as KitchenStatus,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    acceptedAt: events.ACCEPTED ? events.ACCEPTED.toISOString() : null,
    preparingAt: events.PREPARING ? events.PREPARING.toISOString() : null,
    readyAt: events.READY ? events.READY.toISOString() : null,
    serverTime: serverTime.toISOString(),
    branch: row.kitchenBranch ? { id: row.kitchenBranch.id, code: row.kitchenBranch.code, name: row.kitchenBranch.name } : null,
    items: row.items.map((item) => {
      // New orders carry OrderItem.recipeId; legacy rows fall back to the product's recipe (batched, no N+1).
      const recipeId = item.recipeId ?? (item.productId ? recipeIdByProductId.get(item.productId) ?? null : null);
      const recipe = recipeId ? recipeById.get(recipeId) : undefined;
      return {
        id: item.id,
        title: item.itemTitle,
        variantName: item.variantName,
        sku: item.sku,
        quantity: item.quantity,
        recipe: recipe
          ? {
              name: recipe.title,
              servingSize: recipe.servingSize,
              prepTimeMins: recipe.prepTimeMins,
              cookTimeMins: recipe.cookTimeMins,
              chefInstructions: recipe.chefInstructions,
              dietaryTag: recipe.dietaryTag,
              spiceLevel: recipe.spiceLevel
            }
          : null
      };
    })
  };
}
