const readline = require('readline');

const STATUS_PREFIX = {
  pending: '[ ]',
  running: '[>]',
  done: '[ok]',
  skipped: '[-]',
  failed: '[err]',
};

class TerminalReporter {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.enabled = options.enabled ?? Boolean(this.stream.isTTY);
    this.tasks = [];
    this.renderedLines = 0;
  }

  start(tasks) {
    this.tasks = tasks.map((task) => ({
      id: task.id,
      label: task.label,
      status: 'pending',
      message: '',
    }));

    this.render();
  }

  update(id, update) {
    const task = this.tasks.find((item) => item.id === id);

    if (!task) {
      return;
    }

    Object.assign(task, update);

    if (!this.enabled && update.status !== 'running') {
      this.stream.write(this.formatTask(task) + '\n');
      return;
    }

    this.render();
  }

  finish() {
    if (this.enabled) {
      this.render();
    }
  }

  render() {
    if (!this.enabled || !this.tasks.length) {
      return;
    }

    if (this.renderedLines) {
      readline.moveCursor(this.stream, 0, -this.renderedLines);
      readline.cursorTo(this.stream, 0);
      readline.clearScreenDown(this.stream);
    }

    const output = this.tasks.map((task) => this.formatTask(task)).join('\n');
    this.stream.write(`${output}\n`);
    this.renderedLines = this.tasks.length;
  }

  formatTask(task) {
    const prefix = STATUS_PREFIX[task.status] || STATUS_PREFIX.pending;
    const message = task.message ? ` - ${task.message}` : '';

    return `${prefix} ${task.label}${message}`;
  }
}

module.exports = { TerminalReporter };
