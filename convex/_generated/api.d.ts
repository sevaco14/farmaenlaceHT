/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentApply from "../agentApply.js";
import type * as agentData from "../agentData.js";
import type * as agents_bedrock from "../agents/bedrock.js";
import type * as agents_instructions from "../agents/instructions.js";
import type * as agents_run from "../agents/run.js";
import type * as comercial from "../comercial.js";
import type * as insights from "../insights.js";
import type * as live from "../live.js";
import type * as mostrador from "../mostrador.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentApply: typeof agentApply;
  agentData: typeof agentData;
  "agents/bedrock": typeof agents_bedrock;
  "agents/instructions": typeof agents_instructions;
  "agents/run": typeof agents_run;
  comercial: typeof comercial;
  insights: typeof insights;
  live: typeof live;
  mostrador: typeof mostrador;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
