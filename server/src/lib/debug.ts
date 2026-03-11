import fs from "node:fs";
import path from "node:path";
import type { ParseReport } from "@avito-monitor/shared";
import { config } from "../config";

function feedDebugDir(feedId: number): string {
  return path.join(config.debugDir, `feed-${feedId}`);
}

export function saveDebugArtifacts(feedId: number, html: string, report: ParseReport): { htmlPath: string; reportPath: string } {
  const dir = feedDebugDir(feedId);
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = path.join(dir, "last-response.html");
  const reportPath = path.join(dir, "last-parse-report.json");

  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(dir, `${stamp}-response.html`), html, "utf8");
  fs.writeFileSync(path.join(dir, `${stamp}-parse-report.json`), JSON.stringify(report, null, 2), "utf8");

  return { htmlPath, reportPath };
}

export function getLastHtmlPath(feedId: number): string {
  return path.join(feedDebugDir(feedId), "last-response.html");
}

export function getLastReportPath(feedId: number): string {
  return path.join(feedDebugDir(feedId), "last-parse-report.json");
}

export function readLastParseReport(feedId: number): ParseReport | null {
  const reportPath = getLastReportPath(feedId);
  if (!fs.existsSync(reportPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(reportPath, "utf8")) as ParseReport;
}

export function readLastHtml(feedId: number): { path: string; html: string } | null {
  const htmlPath = getLastHtmlPath(feedId);
  if (!fs.existsSync(htmlPath)) {
    return null;
  }

  return {
    path: htmlPath,
    html: fs.readFileSync(htmlPath, "utf8")
  };
}
