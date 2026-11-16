// @vitest-environment node
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMcpIdentityStore } from "./identity-store";

describe.skipIf(!process.env.MCP_TEST_DATABASE_URL)("MCP identity database lease", () => {
  it("serializes setup, preserves IDs after release, and fences stale writers", async () => {
    const url=process.env.MCP_TEST_DATABASE_URL!;
    if (!["localhost","127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Use a disposable local test database.");
    const db=new PrismaClient({datasourceUrl:url}); const id=randomUUID();
    try {
      const user=await db.user.create({data:{entraOid:id,email:`${id}@cedarville.edu`,displayName:"MCP lease fixture"}});
      const template=await db.template.create({data:{slug:id,name:"Lease fixture",description:"Test only",version:"1.0.0",status:"DISABLED",inputSchema:{},hostingOptions:[]}});
      await db.appRequest.create({data:{id,userId:user.id,templateId:template.id,templateVersion:"1.0.0",appName:id,submittedConfig:{},generationStatus:"PENDING",supportReference:id}});
      const store=createMcpIdentityStore(db); const endpoint="https://lease.azurewebsites.net/api/mcp";
      const first=await store.claim(id,endpoint,"tenant");
      await expect(store.claim(id,endpoint,"tenant")).rejects.toThrow(/already in progress/);
      await first.save({applicationObjectId:"owned-resource",applicationClientId:"owned-client"});
      await first.release();
      const second=await store.claim(id,endpoint,"tenant");
      expect(second.record.applicationObjectId).toBe("owned-resource");
      await expect(first.assertCurrent()).rejects.toThrow(/expired/);
      await expect(first.save({setupStatus:"READY"})).rejects.toThrow(/expired/);
      await first.release(); // A stale release cannot clear the new owner's lease.
      await second.assertCurrent();
      await second.release();
    } finally {
      await db.appRequest.deleteMany({where:{id}});
      await db.template.deleteMany({where:{slug:id}});
      await db.user.deleteMany({where:{entraOid:id}});
      await db.$disconnect();
    }
  });
});
