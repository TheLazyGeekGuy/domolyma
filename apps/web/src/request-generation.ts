/** Accept only the newest request of the current identity/context generation. */
export class RequestGeneration {
  private scope = "";
  private generation = 0;
  private request = 0;
  setScope(scope: string) {
    if (scope !== this.scope) {
      this.scope = scope;
      this.invalidate();
    }
  }
  invalidate() {
    this.generation++;
  }
  start(scope: string): (() => boolean) | null {
    if (scope !== this.scope) return null;
    const generation = this.generation,
      request = ++this.request;
    return () =>
      this.scope === scope &&
      this.generation === generation &&
      this.request === request;
  }
}
