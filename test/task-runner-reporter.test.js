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
    enabled: false,
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

  assert.deepEqual(writes, ['[ok] Task - complete\n']);
});

test('TerminalReporter renders and rerenders interactive output', () => {
  const writes = [];
  const stream = {
    isTTY: true,
    write(chunk) {
      writes.push(chunk);
    },
  };
  const reporter = new TerminalReporter({ stream });

  reporter.start([{ id: 'task', label: 'Task' }]);
  reporter.update('task', { status: 'mystery' });
  reporter.finish();

  assert.equal(reporter.enabled, true);
  assert.equal(reporter.renderedLines, 1);
  assert.ok(writes.includes('[ ] Task\n'));
  assert.ok(writes.includes('[ ] Task\n'));
  assert.ok(writes.includes('\u001b[1A'));
  assert.ok(writes.includes('\u001b[1G'));
  assert.ok(writes.includes('\u001b[0J'));
  assert.equal(
    reporter.formatTask({ label: 'Other', status: 'failed' }),
    '[err] Other',
  );
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
  const reporter = new TerminalReporter({ stream });
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
  assert.match(latestProgress, /\[>\] 0\/8 complete, 1 running, 7 pending/);
  assert.ok(writes.includes('\u001b[4A'));

  reporter.finish();

  assert.equal(reporter.renderedLines, 8);
  assert.equal(writes.at(-1).split('\n').filter(Boolean).length, 8);
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
  const reporter = new TerminalReporter({ stream });

  reporter.start([
    {
      id: 'task',
      label: 'This task label is too wide',
    },
  ]);

  assert.deepEqual(writes, ['[ ] This task...\n']);
});
