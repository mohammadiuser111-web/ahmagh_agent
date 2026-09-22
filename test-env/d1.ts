/**
 * محیط تست ایزوله — D1 سازگار با better-sqlite3
 * همان API سطحی که کد ورکر استفاده می‌کند: prepare().bind().run/all/first()
 */
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type D1Result<T> = { results: T[]; success: true; meta: Record<string, unknown> };

class Stmt {
  constructor(private stmt: Database.Statement) {}
  run() {
    const info = this.stmt.run();
    return { success: true as const, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  }
  all<T>(): D1Result<T> {
    return { results: this.stmt.all() as T[], success: true, meta: {} };
  }
  first<T>(): T | null {
    return (this.stmt.get() as T) ?? null;
  }
}

class Prepare {
  constructor(private db: Database.Database, private sql: string) {}
  bind(...args: unknown[]) {
    return new Stmt(this.db.prepare(this.sql).bind(...(args as unknown[])));
  }
  run() {
    return new Stmt(this.db.prepare(this.sql)).run();
  }
  all<T>(): D1Result<T> {
    return new Stmt(this.db.prepare(this.sql)).all<T>();
  }
  first<T>(): T | null {
    return new Stmt(this.db.prepare(this.sql)).first<T>();
  }
}

export class D1Like {
  private db: Database.Database;
  constructor() {
    this.db = new Database(":memory:");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }
  prepare(sql: string) {
    return new Prepare(this.db, sql);
  }
  /** اجرای مستقیم (فقط برای تست) */
  raw(sql: string) {
    return this.db.prepare(sql);
  }
  private migrate() {
    const dir = join(process.cwd(), "migrations");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
      this.db.exec(readFileSync(join(dir, f), "utf-8"));
    }
  }
}
