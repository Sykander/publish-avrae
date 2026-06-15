const readline = require('readline');
const { performance } = require('node:perf_hooks');

const STATUS_SYMBOL = {
  pending: '○',
  running: '▶',
  done: '✔',
  skipped: '-',
  failed: '✖',
};
const STATUS_COLOR = {
  pending: 'gray',
  running: 'blue',
  done: 'green',
  skipped: 'yellow',
  failed: 'red',
};
const COLOR_CODE = {
  blue: 34,
  gray: 90,
  green: 32,
  red: 31,
  yellow: 33,
};
const FINAL_STATUSES = new Set(['done', 'skipped', 'failed']);
const ANSI_PATTERN = /\u001b\[[0-9;]*m/g;
const DEFAULT_TERMINAL_COLUMNS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

function defaultNow() {
  return performance.now();
}

function formatDurationValue(durationMs) {
  if (!Number.isFinite(durationMs)) {
    return undefined;
  }

  return Number(Math.max(0, durationMs).toFixed(6)).toString();
}

function isForcedColor() {
  if (!Object.hasOwn(process.env, 'FORCE_COLOR')) {
    return undefined;
  }

  return process.env.FORCE_COLOR !== '0';
}

function supportsColor(stream) {
  const forcedColor = isForcedColor();

  if (forcedColor !== undefined) {
    return forcedColor;
  }

  if (process.env.NO_COLOR || process.env.NODE_DISABLE_COLORS) {
    return false;
  }

  if (typeof stream?.hasColors === 'function') {
    return stream.hasColors();
  }

  if (typeof stream?.getColorDepth === 'function') {
    return stream.getColorDepth() > 1;
  }

  return Boolean(stream?.isTTY);
}

function stripAnsi(value) {
  return value.replace(ANSI_PATTERN, '');
}

function visibleLength(value) {
  return stripAnsi(value).length;
}

class TerminalReporter {
  constructor(options = {}) {
    this.stream = options.stream || process.stdout;
    this.progressRequested = options.enabled ?? true;
    this.enabled = this.progressRequested && Boolean(this.stream.isTTY);
    this.finalOnly = this.progressRequested && !this.enabled;
    this.colorEnabled = options.color ?? supportsColor(this.stream);
    this.maxColumns = options.maxColumns;
    this.maxLines = options.maxLines;
    this.now = options.now || defaultNow;
    this.tasks = [];
    this.renderedLines = 0;
    this.startedAt = undefined;
    this.finishedAt = undefined;
  }

  start(tasks) {
    this.startedAt = this.now();
    this.finishedAt = undefined;
    this.tasks = tasks.map((task) => ({
      id: task.id,
      label: task.label,
      status: 'pending',
      message: '',
      startedAt: undefined,
      durationMs: undefined,
    }));

    this.render();
  }

  update(id, update) {
    const task = this.tasks.find((item) => item.id === id);

    if (!task) {
      return;
    }

    if (update.status === 'running' && task.startedAt === undefined) {
      task.startedAt = this.now();
    }

    Object.assign(task, update);
    this.completeTaskTiming(task);

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
    this.finishTiming();

    if (this.enabled) {
      this.render({ final: true });
      return;
    }

    if (this.finalOnly && this.tasks.length) {
      this.writeFinalSnapshot();
      return;
    }

    if (!this.progressRequested && this.tasks.length) {
      this.writeFinalReport();
    }
  }

  completeTaskTiming(task) {
    if (!FINAL_STATUSES.has(task.status) || task.durationMs !== undefined) {
      return;
    }

    const startedAt = task.startedAt ?? this.startedAt;

    if (startedAt === undefined) {
      return;
    }

    task.durationMs = this.now() - startedAt;
  }

  finishTiming() {
    if (this.finishedAt === undefined) {
      this.finishedAt = this.now();
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
      return this.fitLines([...lines, ...this.formatReportLines()]);
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

  writeFinalReport() {
    const lines = this.fitLines(this.formatReportLines());

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
    if (visibleLength(line) <= maxColumns) {
      return line;
    }

    if (maxColumns <= 3) {
      return '.'.repeat(maxColumns);
    }

    return `${stripAnsi(line).slice(0, maxColumns - 3)}...`;
  }

  windowedLines(maxLines) {
    if (maxLines <= 1) {
      return [this.formatSummary()];
    }

    if (maxLines === 2) {
      return [
        this.formatSummary(),
        this.formatInfo('tasks', `${this.tasks.length} total`),
      ];
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
      this.formatInfo(
        'showing',
        `${start + 1}-${end} of ${this.tasks.length} tasks`,
      ),
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
    const counts = this.statusCounts();
    const complete = (counts.done || 0) + (counts.skipped || 0);
    const parts = [`${complete}/${this.tasks.length} complete`];

    for (const status of ['running', 'pending', 'failed']) {
      if (counts[status]) {
        parts.push(`${counts[status]} ${status}`);
      }
    }

    const prefix = counts.failed
      ? 'failed'
      : counts.running
        ? 'running'
        : complete === this.tasks.length
          ? 'done'
          : 'pending';

    return this.formatStatusLine(prefix, parts.join(', '));
  }

  formatReportLines() {
    const counts = this.statusCounts();
    const durationMs =
      this.startedAt === undefined
        ? undefined
        : (this.finishedAt ?? this.now()) - this.startedAt;
    const lines = [
      this.formatInfo('tasks', this.tasks.length),
      this.formatInfo('done', counts.done || 0),
      this.formatInfo('failed', counts.failed || 0),
      this.formatInfo('skipped', counts.skipped || 0),
    ];

    for (const status of ['running', 'pending']) {
      if (counts[status]) {
        lines.push(this.formatInfo(status, counts[status]));
      }
    }

    const duration = formatDurationValue(durationMs);

    if (duration !== undefined) {
      lines.push(this.formatInfo('duration_ms', duration));
    }

    return lines;
  }

  statusCounts() {
    return this.tasks.reduce((result, task) => {
      const status = this.statusFor(task);

      return {
        ...result,
        [status]: (result[status] || 0) + 1,
      };
    }, {});
  }

  formatTask(task) {
    const status = this.statusFor(task);
    const symbol = STATUS_SYMBOL[status];
    const message = task.message ? ` - ${task.message}` : '';
    const timing = this.formatTaskTiming(task);

    return [
      this.colorStatus(status, `${symbol} ${task.label}${message}`),
      timing,
    ]
      .filter(Boolean)
      .join(' ');
  }

  formatTaskTiming(task) {
    const duration = formatDurationValue(task.durationMs);

    if (duration === undefined) {
      return '';
    }

    return this.color('gray', `(${duration}ms)`);
  }

  formatStatusLine(status, text) {
    return this.colorStatus(status, `${STATUS_SYMBOL[status]} ${text}`);
  }

  formatInfo(label, value) {
    return this.color('blue', `ℹ ${label} ${value}`);
  }

  colorStatus(status, value) {
    return this.color(STATUS_COLOR[status], value);
  }

  color(colorName, value) {
    if (!this.colorEnabled || !COLOR_CODE[colorName]) {
      return value;
    }

    return `\u001b[${COLOR_CODE[colorName]}m${value}\u001b[39m`;
  }

  statusFor(task) {
    return STATUS_SYMBOL[task.status] ? task.status : 'pending';
  }
}

module.exports = { TerminalReporter };
