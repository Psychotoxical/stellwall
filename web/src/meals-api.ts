import { useQuery } from "@tanstack/react-query";
import type { Ingredient } from "@stellwall/shared";
import { api } from "./api.ts";

export type RecipeRef = { id: string; slug: string; name: string };
/** servingsKnown false: Mealie has no servings (a baking sheet); the amounts are as written. */
export type Category = { id: string; slug: string; name: string };
export type RecipeSummary = RecipeRef & { servings: number; servingsKnown?: boolean; hasImage: boolean; categories?: Category[] };
export type Recipe = RecipeSummary & { ingredients: Ingredient[]; steps: string[] };
export type Meal = { date: string; recipe: RecipeRef | null; text: string | null; cookId: string | null; servings: number; updatedBy: string };
export type ShopLine = { food: string; quantity: string; display: string };
export type ShopPreview = { listId: string; listName: string; special: ShopLine[]; pantry: ShopLine[]; missing: string[] };
export type Staple = { id: string; name: string; variants: string[] };
export type MealieSettings = { url: string | null; hasToken: boolean; listId: string | null };

export const recipeImage = (id: string) => `/api/recipes/${id}/image`;

export const useCategories = (enabled = true) => useQuery({ queryKey: ["recipe-categories"], queryFn: () => api<Category[]>("/api/recipe-categories"), enabled });

export const useMeals = (week: string) => useQuery({ queryKey: ["meals", week], queryFn: () => api<Meal[]>(`/api/meals?week=${week}`), placeholderData: (p) => p });
export const useRecipeSearch = (q: string, enabled: boolean) =>
  useQuery({ queryKey: ["recipes", q], queryFn: () => api<RecipeSummary[]>(`/api/recipes?q=${encodeURIComponent(q)}`), enabled, retry: false, placeholderData: (p) => p });
export const useRecipe = (slug: string | undefined) =>
  useQuery({ queryKey: ["recipe", slug], queryFn: () => api<Recipe>(`/api/recipes/${slug}`), enabled: !!slug, retry: false });
export const usePantry = () => useQuery({ queryKey: ["pantry"], queryFn: () => api<Staple[]>("/api/pantry") });
export const useMealieSettings = (enabled: boolean) => useQuery({ queryKey: ["mealie-settings"], queryFn: () => api<MealieSettings>("/api/settings/mealie"), enabled });
