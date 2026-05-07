import type { Database } from "bun:sqlite";
import { z } from "zod";
import { defineRoute } from "../contract";
import { FavoritesDTOSchema } from "../contract/schemas";
import { listFavorites, setFavorite, unsetFavorite } from "@claude-cron/core";

export interface FavoritesDeps {
  db: Database;
}

const OkSchema = z.object({ ok: z.literal(true) });

export function favoritesListRoute(deps: FavoritesDeps) {
  return defineRoute({
    path: "/api/favorites",
    method: "GET",
    input: z.object({}),
    output: FavoritesDTOSchema,
    handler: () => ({ favorites: listFavorites(deps.db) }),
  });
}

export function favoriteSetRoute(deps: FavoritesDeps) {
  return defineRoute({
    path: "/api/favorites/:project",
    method: "PUT",
    input: z.object({ project: z.string() }),
    output: OkSchema,
    handler: ({ project }) => {
      setFavorite(deps.db, project);
      return { ok: true as const };
    },
  });
}

export function favoriteUnsetRoute(deps: FavoritesDeps) {
  return defineRoute({
    path: "/api/favorites/:project",
    method: "DELETE",
    input: z.object({ project: z.string() }),
    output: OkSchema,
    handler: ({ project }) => {
      unsetFavorite(deps.db, project);
      return { ok: true as const };
    },
  });
}
