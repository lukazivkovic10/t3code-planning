/**
 * ServerPushBusService - ServiceMap wrapper for the server push bus.
 *
 * Allows the push bus to be injected as a typed Effect service dependency
 * into layers that need to publish push events (e.g. KanbanTaskReactor).
 *
 * @module ServerPushBusService
 */
import { ServiceMap } from "effect";

import type { ServerPushBus } from "./pushBus.ts";

export class ServerPushBusService extends ServiceMap.Service<ServerPushBusService, ServerPushBus>()(
  "t3/wsServer/ServerPushBusService",
) {}
