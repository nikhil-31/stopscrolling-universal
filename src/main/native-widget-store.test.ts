import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  nativeWidgetPayload,
  publishNativeWidget,
  publishTrendWidget,
  resetNativeWidgetPublisherForTests,
  trendWidgetPayload,
  type NativeWidgetSummary,
  type TrendWidgetSummary,
} from "./native-widget-store";

function summary(labels: string[]): NativeWidgetSummary {
  return {
    productiveSeconds: 3600,
    neutralSeconds: 120,
    distractingSeconds: 45,
    unratedSeconds: 0,
    top: labels.map((label, index) => ({ key: label, label, seconds: 100 - index })),
  };
}

describe("native widget publisher", () => {
  let directory = "";

  afterEach(() => {
    resetNativeWidgetPublisherForTests();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("writes the summary and keeps five apps", () => {
    directory = mkdtempSync(join(tmpdir(), "stopscrolling-widget-"));
    publishNativeWidget(summary(["One", "Two", "Three", "Four", "Five", "Six"]), {
      directory,
      now: 0,
      reload: () => undefined,
      schedule: false,
    });
    const json = JSON.parse(readFileSync(join(directory, "widget.json"), "utf8")) as ReturnType<typeof nativeWidgetPayload>;
    expect(json.productiveSeconds).toBe(3600);
    expect(json.neutralSeconds).toBe(120);
    expect(json.distractingSeconds).toBe(45);
    expect(json.unratedSeconds).toBe(0);
    expect(json.top.map((app) => app.label)).toEqual(["One", "Two", "Three", "Four", "Five"]);
  });

  it("reloads at most once a minute after a write", () => {
    directory = mkdtempSync(join(tmpdir(), "stopscrolling-widget-"));
    const calls: string[] = [];
    const publish = (labels: string[], now: number) => publishNativeWidget(summary(labels), {
      directory,
      now,
      reload: () => calls.push(labels[0]),
      schedule: false,
    });
    publish(["One", "Two", "Three", "Four", "Five", "Six"], 1_000);
    publish(["Changed", "Two", "Three", "Four", "Five", "Six"], 2_000);
    publish(["Later", "Two", "Three", "Four", "Five", "Six"], 61_000);
    expect(calls).toEqual(["One", "Later"]);
  });

  it("copies the summary into the widget container", () => {
    directory = mkdtempSync(join(tmpdir(), "stopscrolling-widget-"));
    publishNativeWidget(summary(["One", "Two", "Three", "Four", "Five", "Six"]), {
      home: directory,
      now: 0,
      reload: () => undefined,
      schedule: false,
    });
    const mirror = join(
      directory,
      "Library/Containers/com.stopscrolling.desktop.widget/Data/Library/Application Support/widget.json",
    );
    const json = JSON.parse(readFileSync(mirror, "utf8")) as { top: Array<{ label: string }> };
    expect(json.top).toHaveLength(5);
  });

  it("writes trend buckets and the first four apps", () => {
    directory = mkdtempSync(join(tmpdir(), "stopscrolling-widget-"));
    const trend: TrendWidgetSummary = {
      period: "week",
      title: "Week 12",
      buckets: [
        {
          id: "week-0",
          label: "Mon",
          seconds: 100,
          devices: [{ key: "mac", seconds: 40, colorIndex: 0 }, { key: "phone", seconds: 60, colorIndex: 1 }],
        },
        { id: "week-1", label: "Tue", seconds: 20, devices: [] },
      ],
      top: ["One", "Two", "Three", "Four", "Five", "Six"].map((label, index) => ({
        key: label,
        label,
        seconds: 600 - index,
      })),
    };
    publishTrendWidget(trend, { directory, now: 0, reload: () => undefined, schedule: false });
    const json = JSON.parse(readFileSync(join(directory, "trend.json"), "utf8")) as ReturnType<typeof trendWidgetPayload>;
    expect(json.period).toBe("week");
    expect(json.title).toBe("Week 12");
    expect(json.buckets.map((bucket) => bucket.seconds)).toEqual([100, 20]);
    expect(json.buckets[0]?.devices).toEqual([
      { key: "mac", seconds: 40, colorIndex: 0 },
      { key: "phone", seconds: 60, colorIndex: 1 },
    ]);
    expect(json.top.map((app) => app.label)).toEqual(["One", "Two", "Three", "Four"]);
  });

  it("does not import the classifier", () => {
    const source = readFileSync(fileURLToPath(new URL("./native-widget-store.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/jev-productivity|stampSegmentVerdicts|verdictForTitle|productivityBreakdown/);
  });
});
