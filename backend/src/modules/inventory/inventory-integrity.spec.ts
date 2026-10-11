import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InventoryService } from './inventory.service';

describe('admin inventory integrity', () => {
  const record = { id: 'inventory', variantId: 'variant', quantity: 8, reservedQuantity: 2, lowStockThreshold: 3, updatedAt: new Date() };

  test('uses a serializable compare-and-swap and records the exact physical delta', async () => {
    const returned = { ...record, quantity: 10, variant: { sku: 'SKU', colorName: 'Bone', size: 'S', active: true, product: { id: 'p', slug: 'p', name: 'Product', status: 'ACTIVE' } } };
    const tx = {
      inventory: { findUnique: jest.fn().mockResolvedValue(record), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue(returned) },
      inventoryMovement: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const result = await new InventoryService(prisma as any).set('variant', { quantity: 10, lowStockThreshold: 4 });
    expect(tx.inventory.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ quantity: 8, reservedQuantity: 2, updatedAt: record.updatedAt }) }));
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reason: 'MANUAL_ADJUSTMENT', quantity: 2 }) });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    expect(result.availableQuantity).toBe(8);
  });

  test('rejects a stale inventory write instead of overwriting concurrent checkout stock', async () => {
    const tx = { inventory: { findUnique: jest.fn().mockResolvedValue(record), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, inventoryMovement: { create: jest.fn() } };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    await expect(new InventoryService(prisma as any).set('variant', { quantity: 9 })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });
});
