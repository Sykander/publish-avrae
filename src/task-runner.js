async function runTasks(tasks, options = {}) {
  const { reporter } = options;

  reporter?.start?.(tasks);

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      reporter?.update?.(task.id, { status: 'running' });

      try {
        const result = (await task.run()) || {};
        reporter?.update?.(task.id, {
          status: result.status || 'done',
          message: result.message,
        });
        return result;
      } catch (error) {
        reporter?.update?.(task.id, {
          status: 'failed',
          message: error.message,
        });
        throw error;
      }
    }),
  );

  const failures = results.filter(({ status }) => status === 'rejected');

  reporter?.finish?.();

  if (failures.length) {
    const error = new Error(
      `${failures.length} task${failures.length === 1 ? '' : 's'} failed.`,
    );
    error.failures = failures.map(({ reason }) => reason);
    throw error;
  }

  return results.map(({ value }) => value);
}

async function runTasksInOrder(tasks, options = {}) {
  const { reporter } = options;
  const results = [];
  const failures = [];

  reporter?.start?.(tasks);

  for (const task of tasks) {
    reporter?.update?.(task.id, { status: 'running' });

    try {
      const result = (await task.run()) || {};
      reporter?.update?.(task.id, {
        status: result.status || 'done',
        message: result.message,
      });
      results.push(result);
    } catch (error) {
      reporter?.update?.(task.id, {
        status: 'failed',
        message: error.message,
      });
      failures.push(error);
    }
  }

  reporter?.finish?.();

  if (failures.length) {
    const error = new Error(
      `${failures.length} task${failures.length === 1 ? '' : 's'} failed.`,
    );
    error.failures = failures;
    throw error;
  }

  return results;
}

module.exports = { runTasks, runTasksInOrder };
