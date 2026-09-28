export class PresentationTimer {
  private startTime: number = 0;
  private elapsedSeconds: number = 0;
  private isRunning: boolean = false;
  private intervalId: number | null = null;
  private listeners: Set<(seconds: number, isRunning: boolean) => void> = new Set();

  public subscribe(listener: (seconds: number, isRunning: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.elapsedSeconds, this.isRunning);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.elapsedSeconds, this.isRunning);
    }
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now() - this.elapsedSeconds * 1000;
    this.intervalId = window.setInterval(() => {
      this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
      this.notify();
    }, 1000);
    this.notify();
  }

  public pause(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notify();
  }

  public toggle(): void {
    if (this.isRunning) {
      this.pause();
    } else {
      this.start();
    }
  }

  public reset(): void {
    this.pause();
    this.elapsedSeconds = 0;
    this.notify();
  }

  public getElapsed(): number {
    return this.elapsedSeconds;
  }

  public formatTime(): string {
    const mins = Math.floor(this.elapsedSeconds / 60);
    const secs = this.elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}
