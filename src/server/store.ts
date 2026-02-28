import { Task, TaskListParams, TaskListResponse } from '../types.js';
import { ServerCallContext } from './context.js';

/**
 * Simplified interface for task storage providers.
 * Stores and retrieves the task.
 */
export interface TaskStore {
  /**
   * Saves a task.
   * Overwrites existing data if the task ID exists.
   * @param task The task to save.
   * @param context The context of the current call.
   * @returns A promise resolving when the save operation is complete.
   */
  save(task: Task, context?: ServerCallContext): Promise<void>;

  /**
   * Loads a task by task ID.
   * @param taskId The ID of the task to load.
   * @param context The context of the current call.
   * @returns A promise resolving to an object containing the Task, or undefined if not found.
   */
  load(taskId: string, context?: ServerCallContext): Promise<Task | undefined>;

  /**
   * Lists tasks with optional filtering and pagination (A2A spec 6.5).
   * @param params Filtering and pagination parameters.
   * @param context The context of the current call.
   * @returns A promise resolving to the list response.
   */
  list(params: TaskListParams, context?: ServerCallContext): Promise<TaskListResponse>;
}

// ========================
// InMemoryTaskStore
// ========================

// Use Task directly for storage
export class InMemoryTaskStore implements TaskStore {
  private store: Map<string, Task> = new Map();

  async load(taskId: string): Promise<Task | undefined> {
    const entry = this.store.get(taskId);
    // Return copies to prevent external mutation
    return entry ? { ...entry } : undefined;
  }

  async save(task: Task): Promise<void> {
    // Store copies to prevent internal mutation if caller reuses objects
    this.store.set(task.id, { ...task });
  }

  async list(params: TaskListParams): Promise<TaskListResponse> {
    // Filter tasks
    let tasks = Array.from(this.store.values()).filter((t) => {
      if (params.contextId && t.contextId !== params.contextId) return false;
      if (params.status && t.status?.state !== params.status) return false;
      return true;
    });

    // Sort by ID for stable pagination
    tasks.sort((a, b) => a.id.localeCompare(b.id));

    const totalSize = tasks.length;
    const pageSize = Math.min(params.pageSize ?? 20, 100);
    const offset = params.pageToken ? parseInt(params.pageToken, 10) || 0 : 0;

    // Paginate
    const page = tasks.slice(offset, offset + pageSize).map((t) => {
      const copy = { ...t };
      // Truncate history if requested
      if (params.historyLength !== undefined) {
        if (params.historyLength === 0) {
          copy.history = [];
        } else if (copy.history && copy.history.length > params.historyLength) {
          copy.history = copy.history.slice(-params.historyLength);
        }
      }
      return copy;
    });

    const nextOffset = offset + page.length;
    return {
      tasks: page,
      totalSize,
      pageSize,
      nextPageToken: nextOffset < totalSize ? String(nextOffset) : undefined,
    };
  }
}
