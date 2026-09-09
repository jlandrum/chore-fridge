import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { todayKey } from "@chore-fridge/domain/dates";
import { dayView } from "@chore-fridge/domain/day-view";

function text(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function fail(error) {
  return { isError: true, content: [{ type: "text", text: error.message || String(error) }] };
}

export function createHouseholdMcp(storage) {
  const server = new McpServer(
    { name: "chore-fridge", version: "0.2.0" },
    { instructions: "Chore Fridge household tools on a trusted LAN. Use list/get tools before changing tasks. Completing chores and redeeming rewards changes family credit. Do not reset the household or change the PIN." }
  );

  const run = (type, payload) => {
    try {
      const response = storage.command({ id: randomUUID(), type, payload });
      return text({ revision: response.revision, result: response.result, replayed: response.replayed });
    } catch (error) {
      return fail(error);
    }
  };

  const snapshot = () => storage.read();

  server.registerTool("get_board", {
    description: "Current household board for a calendar day, including kids, chores, rewards, and balances.",
    inputSchema: {
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Calendar day YYYY-MM-DD. Defaults to today."),
    },
  }, async ({ day }) => {
    const current = snapshot();
    if (!current.state) return fail(new Error("Household is not set up"));
    const board = dayView(current.state, day || todayKey(), storage.ledger.totals());
    return text({ ...board, revision: current.revision });
  });

  server.registerTool("list_kids", {
    description: "List people on the household board.",
  }, async () => text(snapshot().state?.kids || []));

  server.registerTool("list_chores", {
    description: "List active chores.",
  }, async () => text(snapshot().state?.chores || []));

  server.registerTool("list_rewards", {
    description: "List rewards kids can redeem.",
  }, async () => text(snapshot().state?.rewards || []));

  server.registerTool("list_balances", {
    description: "Star and gold balances keyed by kid ID.",
  }, async () => {
    const totals = storage.ledger.totals();
    return text(Object.fromEntries((snapshot().state?.kids || []).map((kid) => [kid.id, {
      stars: Math.max(0, totals[kid.id]?.stars || 0),
      gold: Math.max(0, totals[kid.id]?.gold || 0),
    }])));
  });

  server.registerTool("complete_task", {
    description: "Mark a chore complete for a kid on a calendar day.",
    inputSchema: {
      choreId: z.string(),
      kidId: z.string(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  }, async ({ choreId, kidId, day }) => run("chore.complete", { choreId, kidId, day: day || todayKey() }));

  server.registerTool("undo_task", {
    description: "Undo a chore completion for a kid on a calendar day.",
    inputSchema: {
      choreId: z.string(),
      kidId: z.string(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  }, async ({ choreId, kidId, day }) => run("chore.undo", { choreId, kidId, day: day || todayKey() }));

  server.registerTool("count_task", {
    description: "Add or remove one count on a counted chore.",
    inputSchema: {
      choreId: z.string(),
      kidId: z.string(),
      delta: z.union([z.literal(1), z.literal(-1)]),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  }, async ({ choreId, kidId, delta, day }) => run("chore.count", { choreId, kidId, delta, day: day || todayKey() }));

  server.registerTool("save_kid", {
    description: "Create or update a kid. Omit id to create.",
    inputSchema: {
      id: z.string().optional(),
      name: z.string(),
      emoji: z.string().optional(),
      color: z.string().optional(),
    },
  }, async (payload) => run("kid.save", { ...payload, id: payload.id || randomUUID() }));

  server.registerTool("save_chore", {
    description: "Create or update a chore. Omit id to create.",
    inputSchema: {
      id: z.string().optional(),
      title: z.string(),
      kidIds: z.array(z.string()).min(1),
      emoji: z.string().optional(),
      points: z.number().int().optional(),
      repeat: z.enum(["daily", "weekly", "once", "every"]).optional(),
      minCount: z.number().int().optional(),
      maxCount: z.number().int().optional(),
      gold: z.boolean().optional(),
      currency: z.enum(["star", "gold", "coin", "dollar", "hours", "custom1", "custom2"]).optional(),
      weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
      sharedClaim: z.boolean().optional(),
      archiveOnComplete: z.boolean().optional(),
      everyN: z.number().int().min(1).max(365).optional(),
      everyUnit: z.enum(["days", "weeks", "months"]).optional(),
      anchorDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  }, async (payload) => run("chore.save", { ...payload, id: payload.id || randomUUID() }));

  server.registerTool("save_reward", {
    description: "Create or update a reward. Omit id to create.",
    inputSchema: {
      id: z.string().optional(),
      title: z.string(),
      cost: z.number().int(),
      emoji: z.string().optional(),
      currencyExchange: z.boolean().optional(),
      exchangeCurrency: z.enum(["star", "gold", "coin", "dollar", "hours", "custom1", "custom2"]).optional(),
      exchangeValue: z.number().int().positive().optional(),
      oncePerDay: z.boolean().optional(),
      gold: z.boolean().optional(),
      currency: z.enum(["star", "gold", "coin", "dollar", "hours", "custom1", "custom2"]).optional(),
    },
  }, async (payload) => run("reward.save", { ...payload, id: payload.id || randomUUID() }));

  server.registerTool("redeem_reward", {
    description: "Redeem a reward for a kid.",
    inputSchema: {
      rewardId: z.string(),
      kidId: z.string(),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    },
  }, async ({ rewardId, kidId, day }) => run("reward.redeem", { rewardId, kidId, day: day || todayKey() }));

  server.registerTool("archive_chore", {
    description: "Archive an active chore.",
    inputSchema: { id: z.string() },
  }, async ({ id }) => run("chore.remove", { id }));

  server.registerTool("restore_chore", {
    description: "Restore an archived chore.",
    inputSchema: { id: z.string() },
  }, async ({ id }) => run("chore.restore", { id }));

  return server;
}

export function mcpIsEnabled(storage) {
  return !!storage.read().state?.mcpEnabled;
}

export async function handleMcpRequest(storage, request, reply) {
  if (!mcpIsEnabled(storage)) {
    return reply.code(404).send({ message: "MCP is turned off in Settings → Advanced" });
  }
  const server = createHouseholdMcp(storage);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  reply.hijack();
  reply.raw.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(request.raw, reply.raw, request.body);
}
