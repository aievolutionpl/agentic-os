import type { ProviderQuotaCard } from "../shared.js";
/** One shared read per refresh window, including simultaneous chat/master/UI requests. */
export class QuotaMonitor {
  private cached: ProviderQuotaCard[] | null = null;
  private at = 0;
  private pending?: Promise<ProviderQuotaCard[]>;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private scan: () => Promise<ProviderQuotaCard[]>,
    private clock = Date.now,
  ) {}
  read(force = false): Promise<ProviderQuotaCard[]> {
    if (this.pending) return this.pending;
    if (!force && this.cached && this.clock() - this.at < 60000)
      return Promise.resolve(this.cached);
    this.pending = this.scan()
      .then((cards) => {
        this.cached = cards;
        this.at = this.clock();
        return cards;
      })
      .finally(() => {
        this.pending = undefined;
      });
    return this.pending;
  }
  invalidate() {
    this.at = 0;
    this.cached = null;
  }
  start() {
    if (this.timer) return;
    void this.read().catch(() => {});
    this.timer = setInterval(() => void this.read(true).catch(() => {}), 60000);
    this.timer.unref();
  }
  async close() {
    clearInterval(this.timer);
    await this.pending?.catch(() => {});
  }
}
