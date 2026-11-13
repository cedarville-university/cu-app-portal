import type { PortalApiOperationRecord, PortalApiOperationStore } from "@/features/portal-api/idempotency";

/** In-memory persistence for exercising the production MCP replay contract. */
export class InMemoryPortalOperationStore implements PortalApiOperationStore {
  records: PortalApiOperationRecord[] = [];
  async deleteExpired() {}
  async find(actorUserId: string, operation: string, idempotencyKey: string) {
    return this.records.find((row) => row.actorUserId === actorUserId && row.operation === operation && row.idempotencyKey === idempotencyKey) ?? null;
  }
  async create(record: Omit<PortalApiOperationRecord, "id" | "createdAt" | "updatedAt">) {
    const row = { ...record, id: String(this.records.length), createdAt: new Date(), updatedAt: new Date() };
    this.records.push(row);
    return row;
  }
  async update(id: string, update: Pick<PortalApiOperationRecord, "state" | "safeResult" | "errorCode">) {
    const row = this.records.find((record) => record.id === id)!;
    Object.assign(row, update);
    return row;
  }
}
