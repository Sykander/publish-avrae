const assert = require('node:assert/strict');
const test = require('node:test');

const { runTasks, runTasksInOrder } = require('../src/task-runner');
const { TerminalReporter } = require('../src/terminal-reporter');

function makeReporter() {
  const events = [];

  return {
    events,
    start(tasks) {
      events.push(['start', tasks.map(({ id }) => id)]);
    },
    update(id, update) {
      events.push(['update', id, update.status, update.message]);
    },
    finish() {
      events.push(['finish']);
    },
  };
}

function makeClock(values) {
  let index = 0;

  return () => values[Math.min(index++, values.length - 1)];
}

function withColorEnv(env, callback) {
  const keys = ['FORCE_COLOR', 'NO_COLOR', 'NODE_DISABLE_COLORS'];
  const original = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }

  Object.assign(process.env, env);

  try {
    callback();
  } finally {
    for (const key of keys) {
      const value = original.get(key);

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('runTasks reports successful and default task results', async () => {
  const reporter = makeReporter();
  const results = await runTasks(
    [
      {
        id: 'one',
        label: 'One',
        async run() {
          return { status: 'skipped', message: 'same' };
        },
      },
      {
        id: 'two',
        label: 'Two',
        async run() {
          return undefined;
        },
      },
    ],
    { reporter },
  );

  assert.deepEqual(results, [{ status: 'skipped', message: 'same' }, {}]);
  assert.deepEqual(reporter.events.at(0), ['start', ['one', 'two']]);
  assert.equal(reporter.events.at(-1)[0], 'finish');
  assert.ok(
    reporter.events.some(
      (event) =>
        event[0] === 'update' && event[1] === 'two' && event[2] === 'done',
    ),
  );
});

test('runTasks aggregates failures after all tasks settle', async () => {
  const reporter = makeReporter();
  const failure = new Error('nope');

  await assert.rejects(
    runTasks(
      [
        {
          id: 'bad',
          label: 'Bad',
          async run() {
            throw failure;
          },
        },
      ],
      { reporter },
    ),
    (error) => {
      assert.equal(error.message, '1 task failed.');
      assert.deepEqual(error.failures, [failure]);
      return true;
    },
  );

  assert.ok(
    reporter.events.some(
      (event) =>
        event[0] === 'update' &&
        event[1] === 'bad' &&
        event[2] === 'failed' &&
        event[3] === 'nope',
    ),
  );
  assert.equal(reporter.events.at(-1)[0], 'finish');
});

test('runTasks covers optional reporting and plural failures', async () => {
  await assert.rejects(
    runTasks([
      {
        id: 'empty',
        label: 'Empty',
        async run() {
          return undefined;
        },
      },
      {
        id: 'bad-one',
        label: 'Bad one',
        async run() {
          throw new Error('bad one');
        },
      },
      {
        id: 'bad-two',
        label: 'Bad two',
        async run() {
          throw new Error('bad two');
        },
      },
    ]),
    (error) => {
      assert.equal(error.message, '2 tasks failed.');
      assert.equal(error.failures.length, 2);
      return true;
    },
  );
});

test('runTasksInOrder continues through failures and pluralizes errors', async () => {
  const reporter = makeReporter();
  const calls = [];

  await assert.rejects(
    runTasksInOrder(
      [
        {
          id: 'first',
          label: 'First',
          async run() {
            calls.push('first');
            throw new Error('first failed');
          },
        },
        {
          id: 'second',
          label: 'Second',
          async run() {
            calls.push('second');
            throw new Error('second failed');
          },
        },
      ],
      { reporter },
    ),
    (error) => {
      assert.equal(error.message, '2 tasks failed.');
      assert.equal(error.failures.length, 2);
      return true;
    },
  );

  assert.deepEqual(calls, ['first', 'second']);
  assert.equal(reporter.events.at(-1)[0], 'finish');
});

test('runTasksInOrder covers optional reporting and default results', async () => {
  await assert.rejects(
    runTasksInOrder([
      {
        id: 'empty',
        label: 'Empty',
        async run() {
          return undefined;
        },
      },
      {
        id: 'bad',
        label: 'Bad',
        async run() {
          throw new Error('bad');
        },
      },
    ]),
    (error) => {
      assert.equal(error.message, '1 task failed.');
      assert.equal(error.failures.length, 1);
      return true;
    },
  );
});

test('runTasksInOrder returns ordered results for successful tasks', async () => {
  const reporter = makeReporter();
  const results = await runTasksInOrder(
    [
      {
        id: 'a',
        label: 'A',
        async run() {
          return { message: 'a' };
        },
      },
      {
        id: 'b',
        label: 'B',
        async run() {
          return { status: 'skipped' };
        },
      },
    ],
    { reporter },
  );

  assert.deepEqual(results, [{ message: 'a' }, { status: 'skipped' }]);
  assert.ok(
    reporter.events.some(
      (event) =>
        event[0] === 'update' &&
        event[1] === 'a' &&
        event[2] === 'done' &&
        event[3] === 'a',
    ),
  );
  assert.ok(
    reporter.events.some(
      (event) =>
        event[0] === 'update' && event[1] === 'b' && event[2] === 'skipped',
    ),
  );
});

test('TerminalReporter writes simple lines when progress rendering is disabled', () => {
  const writes = [];
  const reporter = new TerminalReporter({
    color: false,
    enabled: false,
    now: makeClock([0, 5, 12, 20]),
    stream: {
      write(chunk) {
        writes.push(chunk);
      },
    },
  });

  reporter.start([{ id: 'task', label: 'Task' }]);
  reporter.update('missing', { status: 'done' });
  reporter.update('task', { status: 'running' });
  reporter.update('task', { status: 'done', message: 'complete' });
  reporter.finish();

  assert.deepEqual(writes, [
    '✔ Task - complete (7ms)\n',
    'ℹ tasks 1\nℹ done 1\nℹ failed 0\nℹ skipped 0\nℹ duration_ms 20\n',
  ]);
});

test('TerminalReporter writes one final snapshot without an interactive stream', () => {
  const writes = [];
  const reporter = new TerminalReporter({
    color: false,
    enabled: true,
    now: makeClock([0, 2, 8, 10, 15, 21]),
    stream: {
      write(chunk) {
        writes.push(chunk);
      },
    },
  });

  reporter.start([
    { id: 'gvar:env', label: 'gvar env' },
    { id: 'gvar:config', label: 'gvar config' },
  ]);
  reporter.update('gvar:env', { status: 'running' });
  reporter.update('gvar:env', { status: 'done', message: 'updated' });
  reporter.update('gvar:config', { status: 'running' });
  reporter.update('gvar:config', {
    status: 'skipped',
    message: 'unchanged',
  });

  assert.equal(reporter.enabled, false);
  assert.deepEqual(writes, []);

  reporter.finish();

  assert.deepEqual(writes, [
    [
      '✔ gvar env - updated (6ms)',
      '- gvar config - unchanged (5ms)',
      'ℹ tasks 2',
      'ℹ done 1',
      'ℹ failed 0',
      'ℹ skipped 1',
      'ℹ duration_ms 21',
      '',
    ].join('\n'),
  ]);
});

test('TerminalReporter renders and rerenders interactive output', () => {
  const writes = [];
  const stream = {
    isTTY: true,
    write(chunk) {
      writes.push(chunk);
    },
  };
  const reporter = new TerminalReporter({
    color: false,
    now: makeClock([0, 5]),
    stream,
  });

  reporter.start([{ id: 'task', label: 'Task' }]);
  reporter.update('task', { status: 'mystery' });

  assert.equal(reporter.enabled, true);
  assert.equal(reporter.renderedLines, 1);
  assert.ok(writes.includes('○ Task\n'));
  assert.ok(writes.includes('○ Task\n'));
  assert.ok(writes.includes('\u001b[1A'));
  assert.ok(writes.includes('\u001b[1G'));
  assert.ok(writes.includes('\u001b[0J'));
  assert.equal(
    reporter.formatTask({ label: 'Other', status: 'failed' }),
    '✖ Other',
  );

  reporter.finish();

  assert.equal(reporter.renderedLines, 7);
});

test('TerminalReporter keeps live output inside the terminal viewport', () => {
  const writes = [];
  const stream = {
    columns: 80,
    isTTY: true,
    rows: 5,
    write(chunk) {
      writes.push(chunk);
    },
  };
  const reporter = new TerminalReporter({
    color: false,
    now: makeClock([0, 5, 10]),
    stream,
  });
  const tasks = Array.from({ length: 8 }, (_, index) => ({
    id: `task-${index}`,
    label: `Task ${index}`,
  }));

  reporter.start(tasks);
  reporter.update('task-0', { status: 'running' });

  const progressWrites = writes.filter((chunk) => chunk.includes('showing'));
  const latestProgress = progressWrites.at(-1);

  assert.equal(reporter.renderedLines, 4);
  assert.equal(latestProgress.split('\n').filter(Boolean).length, 4);
  assert.match(latestProgress, /▶ 0\/8 complete, 1 running, 7 pending/);
  assert.ok(writes.includes('\u001b[4A'));

  reporter.finish();

  assert.equal(reporter.renderedLines, 15);
  assert.equal(writes.at(-1).split('\n').filter(Boolean).length, 15);
});

test('TerminalReporter truncates live lines that would wrap', () => {
  const writes = [];
  const stream = {
    columns: 16,
    isTTY: true,
    rows: 10,
    write(chunk) {
      writes.push(chunk);
    },
  };
  const reporter = new TerminalReporter({ color: false, stream });

  reporter.start([
    {
      id: 'task',
      label: 'This task label is too wide',
    },
  ]);

  assert.deepEqual(writes, ['○ This task l...\n']);
});

test('TerminalReporter covers compact summary and formatting branches', () => {
  const reporter = new TerminalReporter({
    color: false,
    enabled: false,
    stream: {
      write() {},
    },
  });

  assert.equal(new TerminalReporter().stream, process.stdout);

  reporter.maxRenderColumns = () => Infinity;
  assert.deepEqual(reporter.fitLines(['wide line']), ['wide line']);
  assert.equal(reporter.fitLine('wide line', 3), '...');

  reporter.tasks = [
    { id: 'done', label: 'Done', status: 'done', message: '' },
    { id: 'skipped', label: 'Skipped', status: 'skipped', message: '' },
    { id: 'other', label: 'Other', status: 'done', message: '' },
  ];

  assert.deepEqual(reporter.windowedLines(1), ['✔ 3/3 complete']);
  assert.deepEqual(reporter.windowedLines(2), [
    '✔ 3/3 complete',
    'ℹ tasks 3 total',
  ]);
  assert.equal(reporter.focusIndex(1), 2);

  reporter.tasks = [
    { id: 'failed', label: 'Failed', status: 'failed', message: '' },
  ];
  assert.equal(reporter.formatSummary(), '✖ 0/1 complete, 1 failed');

  reporter.tasks = [
    { id: 'pending', label: 'Pending', status: 'pending', message: '' },
  ];
  assert.equal(reporter.formatSummary(), '○ 0/1 complete, 1 pending');
  assert.deepEqual(reporter.formatReportLines(), [
    'ℹ tasks 1',
    'ℹ done 0',
    'ℹ failed 0',
    'ℹ skipped 0',
    'ℹ pending 1',
  ]);

  const liveReport = new TerminalReporter({
    color: false,
    now: makeClock([10, 13]),
    stream: {
      write() {},
    },
  });
  liveReport.start([{ id: 'task', label: 'Task' }]);
  assert.equal(liveReport.formatReportLines().at(-1), 'ℹ duration_ms 3');

  const untimedTask = { status: 'done' };
  reporter.completeTaskTiming(untimedTask);
  assert.equal(untimedTask.durationMs, undefined);

  reporter.startedAt = 2;
  reporter.now = () => 7;
  reporter.completeTaskTiming(untimedTask);
  assert.equal(untimedTask.durationMs, 5);

  const taskWithStart = { status: 'done', startedAt: 1 };
  reporter.completeTaskTiming(taskWithStart);
  assert.equal(taskWithStart.durationMs, 6);

  reporter.completeTaskTiming(untimedTask);
  assert.equal(untimedTask.durationMs, 5);
});

test('TerminalReporter colors status and report lines when enabled', () => {
  const reporter = new TerminalReporter({
    color: true,
    enabled: false,
    stream: {
      write() {},
    },
  });
  const plain = new TerminalReporter({
    color: false,
    enabled: false,
    stream: {
      write() {},
    },
  });

  assert.equal(
    reporter.formatTask({ label: 'Done', status: 'done', durationMs: 12.5 }),
    '\u001b[32m✔ Done\u001b[39m \u001b[90m(12.5ms)\u001b[39m',
  );
  assert.equal(
    reporter.formatInfo('tasks', 1),
    '\u001b[34mℹ tasks 1\u001b[39m',
  );
  assert.equal(
    plain.formatTask({ label: 'Done', status: 'done', durationMs: 12.5 }),
    '✔ Done (12.5ms)',
  );
});

test('TerminalReporter detects when color is allowed by the stream or environment', () => {
  withColorEnv({ FORCE_COLOR: '1' }, () => {
    assert.equal(
      new TerminalReporter({ stream: { write() {} } }).colorEnabled,
      true,
    );
  });
  withColorEnv({ FORCE_COLOR: '0' }, () => {
    assert.equal(
      new TerminalReporter({ stream: { isTTY: true, write() {} } })
        .colorEnabled,
      false,
    );
  });
  withColorEnv({ NO_COLOR: '1' }, () => {
    assert.equal(
      new TerminalReporter({ stream: { isTTY: true, write() {} } })
        .colorEnabled,
      false,
    );
  });
  withColorEnv({ NODE_DISABLE_COLORS: '1' }, () => {
    assert.equal(
      new TerminalReporter({ stream: { isTTY: true, write() {} } })
        .colorEnabled,
      false,
    );
  });
  withColorEnv({}, () => {
    assert.equal(
      new TerminalReporter({
        stream: {
          hasColors() {
            return true;
          },
          write() {},
        },
      }).colorEnabled,
      true,
    );
    assert.equal(
      new TerminalReporter({
        stream: {
          getColorDepth() {
            return 1;
          },
          write() {},
        },
      }).colorEnabled,
      false,
    );
    assert.equal(
      new TerminalReporter({
        stream: {
          getColorDepth() {
            return 8;
          },
          write() {},
        },
      }).colorEnabled,
      true,
    );
    assert.equal(
      new TerminalReporter({ stream: { isTTY: true, write() {} } })
        .colorEnabled,
      true,
    );
    assert.equal(
      new TerminalReporter({ stream: { write() {} } }).colorEnabled,
      false,
    );
  });
});
