/**
 * KanbanTaskReactor - Service interface for Kanban task agent lifecycle reactor.
 *
 * Owns background workers that react to orchestration session-set events and
 * apply Kanban task state transitions when agent threads complete or fail.
 *
 * @module KanbanTaskReactor
 */
import { ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

/**
 * KanbanTaskReactorShape - Service API for Kanban task reactor lifecycle.
 */
export interface KanbanTaskReactorShape {
  /**
   * Start the Kanban task reactor.
   *
   * The returned effect must be run in a scope so all worker fibers can be
   * finalized on shutdown.
   */
  readonly start: Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle.
   * Intended for test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * KanbanTaskReactor - Service tag for the Kanban task reactor worker.
 */
export class KanbanTaskReactor extends ServiceMap.Service<
  KanbanTaskReactor,
  KanbanTaskReactorShape
>()("t3/kanban/Services/KanbanTaskReactor") {}
