import { describe, expect, it } from "vitest";
import { normalizeEditField, parseStatus } from "./format";

describe("normalizeEditField", () => {
  it("فارسی", () => {
    expect(normalizeEditField("عنوان")).toBe("title");
    expect(normalizeEditField("عنوانش")).toBe("title");
    expect(normalizeEditField("توضیح")).toBe("description");
    expect(normalizeEditField("توضیحات")).toBe("description");
    expect(normalizeEditField("مسئول")).toBe("assignee");
    expect(normalizeEditField("شروع")).toBe("start");
    expect(normalizeEditField("پایان")).toBe("due");
    expect(normalizeEditField("سررسید")).toBe("due");
    expect(normalizeEditField("مهلت")).toBe("due");
    expect(normalizeEditField("تا")).toBe("due");
    expect(normalizeEditField("وضعیت")).toBe("status");
  });

  it("با دونقطه", () => {
    expect(normalizeEditField("پایان:")).toBe("due");
    expect(normalizeEditField("عنوان:")).toBe("title");
  });

  it("انگلیسی", () => {
    expect(normalizeEditField("title")).toBe("title");
    expect(normalizeEditField("Title")).toBe("title");
    expect(normalizeEditField("due")).toBe("due");
    expect(normalizeEditField("deadline")).toBe("due");
    expect(normalizeEditField("status")).toBe("status");
  });

  it("نامعتبر → null", () => {
    expect(normalizeEditField("فیلد غلط")).toBeNull();
    expect(normalizeEditField("")).toBeNull();
    expect(normalizeEditField("xyz")).toBeNull();
  });
});

describe("parseStatus (برای /edit وضعیت)", () => {
  it("فارسی با نیم‌فاصله/فاصله", () => {
    expect(parseStatus("در حال انجام")).toBe("in_progress");
    expect(parseStatus("تمام شده")).toBe("done");
    expect(parseStatus("شروع نشده")).toBe("not_started");
    expect(parseStatus("تموم")).toBe("done");
  });
  it("انگلیسی", () => {
    expect(parseStatus("done")).toBe("done");
    expect(parseStatus("in_progress")).toBe("in_progress");
  });
});
