const readline = require('readline');

const STATUS_PREFIX = {
  pending: '[ ]',
  running: '[>]',
  done: '[ok]',
  skipped: '[-]',
  failed: '[err]',
};
const DEFAULT_TERMINAL_COLUMNS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

class TerminalReporter {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.progressRequested = options.enabled ?? true;
    this.enabled = this.progressRequested && Boolean(this.stream.isTTY);
    this.finalOnly = this.progressRequested && !this.enabled;
    this.maxColumns = options.maxColumns;
    this.maxLines = options.maxLines;
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

    if (this.finalOnly) {
      return;
    }

    if (!this.enabled && update.status !== 'running') {
      this.stream.write(this.formatTask(task) + '\n');
      return;
    }

    this.render();
  }

  finish() {
    if (this.enabled) {
      this.render({ final: true });
      return;
    }

    if (this.finalOnly && this.tasks.length) {
      this.writeFinalSnapshot();
    }
  }

  render(options = {}) {
    if (!this.enabled || !this.tasks.length) {
      return;
    }

    if (this.renderedLines) {
      readline.moveCursor(this.stream, 0, -this.renderedLines);
      readline.cursorTo(this.stream, 0);
      readline.clearScreenDown(this.stream);
    }

    const lines = this.renderLines(options);
    const output = lines.join('\n');
    this.stream.write(`${output}\n`);
    this.renderedLines = lines.length;
  }

  renderLines(options = {}) {
    const lines = this.tasks.map((task) => this.formatTask(task));

    if (options.final) {
      return lines;
    }

    const maxLines = this.maxRenderLines();

    if (lines.length <= maxLines) {
      return this.fitLines(lines);
    }

    return this.fitLines(this.windowedLines(maxLines));
  }

  writeFinalSnapshot() {
    const lines = this.renderLines({ final: true });

    this.stream.write(`${lines.join('\n')}\n`);
    this.renderedLines = lines.length;
  }

  maxRenderLines() {
    const configured =
      this.maxLines ?? this.stream.rows ?? Number(process.env.LINES);

    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_TERMINAL_ROWS - 1;
    }

    return Math.max(1, Math.floor(configured) - 1);
  }

  maxRenderColumns() {
    const configured =
      this.maxColumns ?? this.stream.columns ?? Number(process.env.COLUMNS);

    if (!Number.isFinite(configured) || configured <= 0) {
      return DEFAULT_TERMINAL_COLUMNS;
    }

    return Math.max(1, Math.floor(configured));
  }

  fitLines(lines) {
    const maxColumns = this.maxRenderColumns();

    if (!Number.isFinite(maxColumns)) {
      return lines;
    }

    return lines.map((line) => this.fitLine(line, maxColumns));
  }

  fitLine(line, maxColumns) {
    if (line.length <= maxColumns) {
      return line;
    }

    if (maxColumns <= 3) {
      return '.'.repeat(maxColumns);
    }

    return `${line.slice(0, maxColumns - 3)}...`;
  }

  windowedLines(maxLines) {
    if (maxLines <= 1) {
      return [this.formatSummary()];
    }

    if (maxLines === 2) {
      return [this.formatSummary(), `... ${this.tasks.length} tasks total`];
    }

    const taskCapacity = maxLines - 2;
    const focusIndex = this.focusIndex(taskCapacity);
    const start = Math.min(
      Math.max(0, focusIndex - Math.floor(taskCapacity / 3)),
      Math.max(0, this.tasks.length - taskCapacity),
    );
    const end = Math.min(this.tasks.length, start + taskCapacity);

    return [
      this.formatSummary(),
      ...this.tasks.slice(start, end).map((task) => this.formatTask(task)),
      `... showing ${start + 1}-${end} of ${this.tasks.length} tasks`,
    ];
  }

  focusIndex(taskCapacity) {
    for (const status of ['failed', 'running', 'pending']) {
      const index = this.tasks.findIndex((task) => task.status === status);

      if (index !== -1) {
        return index;
      }
    }

    return Math.max(0, this.tasks.length - taskCapacity);
  }

  formatSummary() {
    const counts = this.tasks.reduce(
      (result, task) => ({
        ...result,
        [task.status]: (result[task.status] || 0) + 1,
      }),
      {},
    );
    const complete = (counts.done || 0) + (counts.skipped || 0);
    const parts = [`${complete}/${this.tasks.length} complete`];

    for (const status of ['running', 'pending', 'failed']) {
      if (counts[status]) {
        parts.push(`${counts[status]} ${status}`);
      }
    }

    const prefix = counts.failed
      ? STATUS_PREFIX.failed
      : counts.running
        ? STATUS_PREFIX.running
        : complete === this.tasks.length
          ? STATUS_PREFIX.done
          : STATUS_PREFIX.pending;

    return `${prefix} ${parts.join(', ')}`;
  }

  formatTask(task) {
    const prefix = STATUS_PREFIX[task.status] || STATUS_PREFIX.pending;
    const message = task.message ? ` - ${task.message}` : '';

    return `${prefix} ${task.label}${message}`;
  }
}

module.exports = { TerminalReporter };
