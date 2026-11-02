/**
 * Runs one task at a time: a task asked for while another runs is not run,
 * and gets `busy` back at once. Used for the file dialogs (8.12), so the
 * maker never has two to answer.
 */
export class OneAtATime {
  private running = false;

  async run<T>(busy: T, task: () => Promise<T>): Promise<T> {
    if (this.running) return busy;
    this.running = true;
    try {
      return await task();
    } finally {
      this.running = false;
    }
  }
}
