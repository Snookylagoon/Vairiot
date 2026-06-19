const startedAt = Date.now();

interface RequestMetrics {
  totalRequests: number;
  totalErrors: number;
  statusCodes: Record<string, number>;
  avgResponseTime: number;
  p95ResponseTime: number;
}

class Metrics {
  private totalRequests = 0;
  private totalErrors = 0;
  private statusCodes: Record<string, number> = {};
  private responseTimes: number[] = [];
  private readonly maxSamples = 1000;

  recordRequest(method: string, path: string, status: number, durationMs: number) {
    this.totalRequests++;
    if (status >= 500) this.totalErrors++;
    const bucket = `${Math.floor(status / 100)}xx`;
    this.statusCodes[bucket] = (this.statusCodes[bucket] ?? 0) + 1;
    this.responseTimes.push(durationMs);
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes = this.responseTimes.slice(-this.maxSamples);
    }
  }

  getSummary(): RequestMetrics & { uptimeSeconds: number } {
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    return {
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      statusCodes: { ...this.statusCodes },
      avgResponseTime: Math.round(avg),
      p95ResponseTime: Math.round(p95),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
  }
}

export const metrics = new Metrics();
