import { db } from '../db/index.js';
import {
  CreateInventoryItemInput,
  InventoryItem,
  UpdateInventoryItem,
  UrgencyLevel,
} from '../schemas/index.js';

export function calculateDaysRemaining(expiryDateStr: string): number {
  const now = new Date();
  // Normalize now to start of day
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const expDateObj = new Date(expiryDateStr);
  const expDate = new Date(expDateObj.getFullYear(), expDateObj.getMonth(), expDateObj.getDate());
  
  const diffTime = expDate.getTime() - nowDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

export function computeUrgency(daysRemaining: number): UrgencyLevel {
  // green (>3 days), amber/yellow (1-2 days, or up to 3 days), red (expired <= 0 days)
  if (daysRemaining <= 0) {
    return 'red';
  }
  if (daysRemaining <= 2) {
    return 'yellow';
  }
  return 'green';
}

function rowToInventoryItem(row: any): InventoryItem {
  const daysRemaining = calculateDaysRemaining(row.expiry_date);
  const urgencyLevel = computeUrgency(daysRemaining);

  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    category: row.category,
    quantity: row.quantity,
    unit: row.unit || '',
    storage_location: row.storage_location,
    confidence: row.confidence,
    storage_days: row.storage_days,
    expiry_date: row.expiry_date,
    added_at: row.added_at,
    status: row.status,
    updated_at: row.updated_at,
    urgency_level: urgencyLevel,
    days_remaining: daysRemaining,
  };
}

export function listActiveInventory(userId: string = 'guest'): InventoryItem[] {
  const stmt = db.prepare(`
    SELECT * FROM inventory_items
    WHERE user_id = ? AND status = 'active'
    ORDER BY expiry_date ASC, id ASC
  `);
  const rows = stmt.all(userId);
  return rows.map(rowToInventoryItem);
}

export function getInventoryItemById(id: number, userId: string = 'guest'): InventoryItem | null {
  const stmt = db.prepare(`
    SELECT * FROM inventory_items
    WHERE id = ? AND user_id = ?
  `);
  const row = stmt.get(id, userId);
  return row ? rowToInventoryItem(row) : null;
}

export function batchAddInventory(
  items: CreateInventoryItemInput[],
  userId: string = 'guest'
): InventoryItem[] {
  const now = new Date();
  const addedAt = now.toISOString();

  const insertStmt = db.prepare(`
    INSERT INTO inventory_items (
      user_id, name, category, quantity, unit, storage_location,
      confidence, storage_days, expiry_date, added_at, status, updated_at
    ) VALUES (
      @user_id, @name, @category, @quantity, @unit, @storage_location,
      @confidence, @storage_days, @expiry_date, @added_at, 'active', @updated_at
    )
  `);

  const insertedIds: number[] = [];

  const runTransaction = db.transaction((itemList: CreateInventoryItemInput[]) => {
    for (const item of itemList) {
      const storageDays = item.storage_days ?? 3;
      let expiryDate = item.expiry_date;
      if (!expiryDate) {
        const exp = new Date(now);
        exp.setDate(exp.getDate() + storageDays);
        expiryDate = exp.toISOString().slice(0, 10); // YYYY-MM-DD
      }

      const info = insertStmt.run({
        user_id: userId,
        name: item.name.trim(),
        category: item.category || '其他',
        quantity: item.quantity || '1份',
        unit: item.unit || '',
        storage_location: item.storage_location || '冷藏',
        confidence: item.confidence ?? 1.0,
        storage_days: storageDays,
        expiry_date: expiryDate,
        added_at: addedAt,
        updated_at: addedAt,
      });

      insertedIds.push(Number(info.lastInsertRowid));
    }
  });

  runTransaction(items);

  const placeholders = insertedIds.map(() => '?').join(',');
  const selectStmt = db.prepare(`
    SELECT * FROM inventory_items
    WHERE id IN (${placeholders})
    ORDER BY id ASC
  `);
  const rows = selectStmt.all(...insertedIds);
  return rows.map(rowToInventoryItem);
}

export function updateInventoryItem(
  id: number,
  data: UpdateInventoryItem,
  userId: string = 'guest'
): InventoryItem | null {
  const existing = getInventoryItemById(id, userId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: any[] = [now];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name.trim());
  }
  if (data.category !== undefined) {
    updates.push('category = ?');
    values.push(data.category);
  }
  if (data.quantity !== undefined) {
    updates.push('quantity = ?');
    values.push(data.quantity);
  }
  if (data.unit !== undefined) {
    updates.push('unit = ?');
    values.push(data.unit);
  }
  if (data.storage_location !== undefined) {
    updates.push('storage_location = ?');
    values.push(data.storage_location);
  }
  if (data.storage_days !== undefined) {
    updates.push('storage_days = ?');
    values.push(data.storage_days);
  }
  if (data.expiry_date !== undefined) {
    updates.push('expiry_date = ?');
    values.push(data.expiry_date);
  }
  if (data.status !== undefined) {
    updates.push('status = ?');
    values.push(data.status);
  }

  values.push(id, userId);

  const query = `
    UPDATE inventory_items
    SET ${updates.join(', ')}
    WHERE id = ? AND user_id = ?
  `;

  db.prepare(query).run(...values);
  return getInventoryItemById(id, userId);
}

export function deleteInventoryItem(id: number, userId: string = 'guest'): boolean {
  const stmt = db.prepare(`
    DELETE FROM inventory_items
    WHERE id = ? AND user_id = ?
  `);
  const result = stmt.run(id, userId);
  return result.changes > 0;
}

export function markItemsAsConsumed(itemIds: number[], userId: string = 'guest'): number {
  if (itemIds.length === 0) return 0;
  const now = new Date().toISOString();
  const placeholders = itemIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    UPDATE inventory_items
    SET status = 'consumed', updated_at = ?
    WHERE id IN (${placeholders}) AND user_id = ?
  `);
  const result = stmt.run(now, ...itemIds, userId);
  return result.changes;
}
