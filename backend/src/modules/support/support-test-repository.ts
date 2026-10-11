const customer = {
    id: "customer-a",
    email: "account@example.invalid",
    role: "CUSTOMER",
  },
  admin = { id: "admin-a", email: "admin@example.invalid", role: "ADMIN" };
// A stateful transactional repository keeps tests focused on visible saved behavior.
export function memoryDb() {
  const rows: Record<string, any[]> = {
    supportTicket: [],
    supportMessage: [],
    supportGuestAccess: [],
    supportEmailDelivery: [],
    supportAdminRead: [],
    auditLog: [],
  };
  let n = 0;
  const match = (row: any, where: any): boolean =>
    !where ||
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (k === "OR") return v.some((x: any) => match(row, x));
      if (k === "AND") return v.every((x: any) => match(row, x));
      if (k === "ticketId_userId" || k === "ticketId_submissionKey")
        return match(row, v);
      if (v && typeof v === "object" && !(v instanceof Date))
        return Object.entries(v).every(([op, w]: [string, any]) =>
          op === "gt"
            ? row[k] > w
            : op === "lt"
              ? row[k] < w
              : op === "lte"
                ? row[k] <= w
                : op === "gte"
                  ? row[k] >= w
                  : op === "in"
                    ? w.includes(row[k])
                    : op === "not"
                      ? row[k] !== w
                      : row[k] === w,
        );
      return row[k] instanceof Date && v instanceof Date
        ? +row[k] === +v
        : row[k] === v;
    });
  const db: any = {
    rows,
    user: {
      findUnique: async ({ where }: any) =>
        [customer, admin].find((x) => x.id === where.id)
          ? {
              ...[customer, admin].find((x) => x.id === where.id),
              firstName: "Account",
              lastName: "Customer",
              status: "ACTIVE",
            }
          : null,
    },
  };
  for (const table of Object.keys(rows)) {
    const expand = (r: any, args: any) =>
      !r
        ? null
        : {
            ...r,
            ...(args?.include?.messages
              ? {
                  messages: rows.supportMessage
                    .filter((m) => m.ticketId === r.id)
                    .sort((a, b) => a.sequence - b.sequence),
                }
              : {}),
            ...(args?.include?.deliveries
              ? {
                  deliveries: rows.supportEmailDelivery.filter(
                    (d) => d.ticketId === r.id,
                  ),
                }
              : {}),
            ...(args?.include?.adminReads
              ? {
                  adminReads: rows.supportAdminRead.filter(
                    (a) => a.ticketId === r.id,
                  ),
                }
              : {}),
          };
    db[table] = {
      findUnique: async (args: any) =>
        expand(
          rows[table].find((r) => match(r, args.where)),
          args,
        ),
      findFirst: async (args: any) =>
        expand(
          rows[table].find((r) => match(r, args.where)),
          args,
        ),
      findMany: async (args: any = {}) =>
        rows[table]
          .filter((r) => match(r, args.where))
          .slice(args.skip || 0, (args.skip || 0) + (args.take || 9999))
          .map((r) => expand(r, args)),
      count: async (args: any = {}) =>
        rows[table].filter((r) => match(r, args.where)).length,
      create: async ({ data }: any) => {
        const r = {
          id: "row-" + ++n,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
          status: table === "supportTicket" ? "OPEN" : "PENDING",
          version: 0,
          lastSequence: 0,
          lastCustomerSequence: 0,
          lastAdminSequence: 0,
          customerReadSequence: 0,
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseId: null,
          leaseExpiresAt: null,
          sentAt: null,
          ...data,
        };
        rows[table].push(r);
        return { ...r };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const r of rows[table].filter((r) => match(r, where))) {
          count++;
          for (const [k, v] of Object.entries(data) as any)
            r[k] =
              v && typeof v === "object" && "increment" in v
                ? r[k] + v.increment
                : v;
          r.updatedAt = new Date();
        }
        return { count };
      },
      upsert: async ({ where, create, update }: any) => {
        const r = rows[table].find((x) => match(x, where));
        if (r) {
          Object.assign(r, update);
          return { ...r };
        }
        return db[table].create({ data: create });
      },
    };
  }
  let chain = Promise.resolve();
  db.$transaction = (fn: any) => {
    const run = chain.then(async () => {
      const snapshot = structuredClone(rows);
      try {
        return await fn(db);
      } catch (e) {
        for (const k of Object.keys(rows)) rows[k] = snapshot[k];
        throw e;
      }
    });
    chain = run.catch(() => {});
    return run;
  };
  return db;
}
