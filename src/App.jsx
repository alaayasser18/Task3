
import React, { useState, useEffect, useRef } from 'react';
import { fetchTasks, updateTask } from './api.js';

const PRIORITY_WEIGHT = {
  Urgent: 3,
  High: 2,
  Medium: 1,
  Low: 0,
};

const LOW_STOCK_LIMIT = 15;
const MAX_HISTORY = 100;

function sortTasks(items, mode) {
  const result = [...items];

  if (mode === 'priorityAsc') {
    return result.sort(
      (a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]
    );
  }

  if (mode === 'priorityDesc') {
    return result.sort(
      (a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
    );
  }

  if (mode === 'reverse') {
    return result.reverse();
  }

  return result;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [isSearching, setIsSearching] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [saveCount, setSaveCount] = useState(0);
  const [lastSavedPayload, setLastSavedPayload] = useState(null);
  const [saveError, setSaveError] = useState('');
  const [history, setHistory] = useState([]);
  const [sortMode, setSortMode] = useState('default');

  const requestId = useRef(0);
  const tasksRef = useRef(tasks);
  const selectedTaskIdsRef = useRef(selectedTaskIds);
  const historyRef = useRef(history);
  const sortModeRef = useRef(sortMode);
  const priorityFilterRef = useRef(priorityFilter);
  const saveInProgress = useRef(false);

  // Tracks any change made while a save is running.
  const changeVersion = useRef(0);

  tasksRef.current = tasks;
  selectedTaskIdsRef.current = selectedTaskIds;
  historyRef.current = history;
  sortModeRef.current = sortMode;
  priorityFilterRef.current = priorityFilter;

  const replaceTasks = (nextTasks) => {
    tasksRef.current = nextTasks;
    changeVersion.current += 1;
    setTasks(nextTasks);
  };

  const replaceSelection = (nextIds) => {
    selectedTaskIdsRef.current = nextIds;
    changeVersion.current += 1;
    setSelectedTaskIds(nextIds);
  };

  const saveHistory = () => {
    const snapshot = {
      tasks: tasksRef.current.map((task) => ({ ...task })),
      selectedTaskIds: [...selectedTaskIdsRef.current],
      sortMode: sortModeRef.current,
    };

    const nextHistory = [...historyRef.current, snapshot].slice(-MAX_HISTORY);

    historyRef.current = nextHistory;
    setHistory(nextHistory);
  };

  // Fetch results safely: an older search cannot replace newer results.
  useEffect(() => {
    let active = true;
    const currentRequest = ++requestId.current;

    setIsSearching(true);

    fetchTasks(searchQuery, categoryFilter)
      .then((results) => {
        if (!active || currentRequest !== requestId.current) return;

        const sortedResults = sortTasks(results, sortModeRef.current);
        replaceTasks(sortedResults);
      })
      .catch((error) => {
        if (active && currentRequest === requestId.current) {
          console.error('Failed to fetch tasks:', error);
          setSaveError('Could not load tasks.');
        }
      })
      .finally(() => {
        if (active && currentRequest === requestId.current) {
          setIsSearching(false);
        }
      });

    return () => {
      active = false;
    };
  }, [searchQuery, categoryFilter]);

  // Undo the latest recorded change.
  const handleUndo = async () => {
    const currentHistory = historyRef.current;
    if (currentHistory.length === 0) return;

    const previous = currentHistory[currentHistory.length - 1];
    const remainingHistory = currentHistory.slice(0, -1);
    const restoredTasks = previous.tasks.map((task) => ({ ...task }));

    historyRef.current = remainingHistory;
    setHistory(remainingHistory);

    sortModeRef.current = previous.sortMode;
    setSortMode(previous.sortMode);

    replaceTasks(restoredTasks);
    replaceSelection([...previous.selectedTaskIds]);

    try {
      await Promise.all(
        restoredTasks.map((task) => updateTask(task.id, task))
      );
      setSaveError('');
    } catch (error) {
      console.error('Undo update failed:', error);
      setSaveError('Undo restored the screen, but syncing failed.');
    }
  };

  const handleSortByPriority = () => {
    saveHistory();

    const nextMode =
      sortModeRef.current === 'priorityAsc'
        ? 'priorityDesc'
        : 'priorityAsc';

    sortModeRef.current = nextMode;
    setSortMode(nextMode);
    replaceTasks(sortTasks(tasksRef.current, nextMode));
  };

  const handleReverse = () => {
    saveHistory();

    const nextMode = 'reverse';
    sortModeRef.current = nextMode;
    setSortMode(nextMode);
    replaceTasks(sortTasks(tasksRef.current, nextMode));
  };

  const handleToggleSelect = (taskId) => {
    const currentIds = selectedTaskIdsRef.current;

    const nextIds = currentIds.includes(taskId)
      ? currentIds.filter((id) => id !== taskId)
      : [...currentIds, taskId];

    replaceSelection(nextIds);
  };

  const handleStockChange = (taskId, value) => {
    if (value === '') {
      saveHistory();

      const updatedTasks = tasksRef.current.map((task) =>
        task.id === taskId ? { ...task, stockUnits: '' } : task
      );

      replaceTasks(updatedTasks);
      return;
    }

    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue) || parsedValue < 0) return;

    const stockUnits = Math.floor(parsedValue);

    saveHistory();

    const updatedTasks = tasksRef.current.map((task) =>
      task.id === taskId ? { ...task, stockUnits } : task
    );

    replaceTasks(updatedTasks);

    updateTask(taskId, { stockUnits }).catch((error) => {
      console.error('Failed to update stock:', error);
      setSaveError('A stock update failed to sync.');
    });
  };

  const handleStockBlur = (taskId) => {
    const updatedTasks = tasksRef.current.map((task) => {
      if (task.id !== taskId) return task;

      const value = Number(task.stockUnits);

      return {
        ...task,
        stockUnits:
          Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0,
      };
    });

    replaceTasks(updatedTasks);

    const task = updatedTasks.find((item) => item.id === taskId);

    if (task) {
      updateTask(taskId, { stockUnits: task.stockUnits }).catch((error) => {
        console.error('Failed to save stock:', error);
        setSaveError('A stock update failed to sync.');
      });
    }
  };

  const handleNoteChange = (taskId, notes) => {
    saveHistory();

    const updatedTasks = tasksRef.current.map((task) =>
      task.id === taskId ? { ...task, notes } : task
    );

    replaceTasks(updatedTasks);

    updateTask(taskId, { notes }).catch((error) => {
      console.error('Failed to update note:', error);
      setSaveError('A note update failed to sync.');
    });
  };

  // Tasks currently visible after the priority filter.
  const displayedTasks = tasks.filter(
    (task) => priorityFilter === 'All' || task.priority === priorityFilter
  );

  // Count only selected tasks that are currently visible.
  const visibleSelectedIds = displayedTasks
    .filter((task) => selectedTaskIds.includes(task.id))
    .map((task) => task.id);

  const handleBulkComplete = () => {
    if (visibleSelectedIds.length === 0) return;

    saveHistory();

    const idsToUpdate = [...visibleSelectedIds];

    const updatedTasks = tasksRef.current.map((task) =>
      idsToUpdate.includes(task.id)
        ? { ...task, status: 'Completed' }
        : task
    );

    replaceTasks(updatedTasks);

    Promise.all(
      updatedTasks
        .filter((task) => idsToUpdate.includes(task.id))
        .map((task) => updateTask(task.id, { status: 'Completed' }))
    ).catch((error) => {
      console.error('Failed to complete selected tasks:', error);
      setSaveError('Some selected tasks failed to sync.');
    });
  };

  const handleBulkRestock = () => {
    if (visibleSelectedIds.length === 0) return;

    saveHistory();

    const idsToUpdate = [...visibleSelectedIds];

    const updatedTasks = tasksRef.current.map((task) =>
      idsToUpdate.includes(task.id)
        ? {
            ...task,
            stockUnits: (Number(task.stockUnits) || 0) + 10,
          }
        : task
    );

    replaceTasks(updatedTasks);

    Promise.all(
      updatedTasks
        .filter((task) => idsToUpdate.includes(task.id))
        .map((task) =>
          updateTask(task.id, { stockUnits: task.stockUnits })
        )
    ).catch((error) => {
      console.error('Failed to restock selected tasks:', error);
      setSaveError('Some stock changes failed to sync.');
    });
  };

  // Auto-save every five seconds.
  // If data changes during a save, save again using the latest snapshot.
  useEffect(() => {
    let ticks = 5;
    let cancelled = false;

    const saveLatestData = async () => {
      if (saveInProgress.current) return;

      saveInProgress.current = true;

      try {
        while (!cancelled) {
          // Record the version before taking the snapshot.
          const versionAtStart = changeVersion.current;
          const filterAtStart = priorityFilterRef.current;

          const currentTasks = tasksRef.current.map((task) => {
            const value = Number(task.stockUnits);

            return {
              ...task,
              stockUnits:
                Number.isFinite(value) && value >= 0
                  ? Math.floor(value)
                  : 0,
            };
          });

          const currentSelectedIds = [
            ...selectedTaskIdsRef.current,
          ];

          // Write this exact snapshot to the data source.
          await Promise.all(
            currentTasks.map((task) => updateTask(task.id, task))
          );

          if (cancelled) return;

          // If anything changed while saving, loop and save again.
          const dataDidNotChange =
            versionAtStart === changeVersion.current &&
            filterAtStart === priorityFilterRef.current;

          if (!dataDidNotChange) {
            continue;
          }

          // Only display a payload after its snapshot has been saved
          // and confirmed to still be the latest version.
          setLastSavedPayload({
            savedAt: new Date().toLocaleTimeString(),
            priorityFilter: filterAtStart,
            selectedTaskIds: currentSelectedIds,
            tasks: currentTasks,
          });

          setSaveCount((count) => count + 1);
          setSaveError('');
          break;
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        setSaveError('Auto-save failed. It will try again.');
      } finally {
        saveInProgress.current = false;
      }
    };

    const timer = setInterval(() => {
      ticks -= 1;
      setCountdown(ticks);

      if (ticks <= 0) {
        ticks = 5;
        setCountdown(5);
        saveLatestData();
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [priorityFilter]);

  const totalUnits = displayedTasks.reduce(
    (sum, task) => sum + (Number(task.stockUnits) || 0),
    0
  );

  const lowStockCount = displayedTasks.filter(
    (task) => (Number(task.stockUnits) || 0) < LOW_STOCK_LIMIT
  ).length;

  const completedCount = displayedTasks.filter(
    (task) => task.status === 'Completed'
  ).length;

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <h1>Inventory &amp; Operations Dispatch</h1>
          <p className="muted">
            Warehouse maintenance schedules, restock audits and field units.
          </p>
        </div>

        <div className="actions">
          <button
            className="btn ghost"
            onClick={handleUndo}
            disabled={history.length === 0}
          >
            Undo ({history.length})
          </button>

          <button className="btn primary" onClick={handleSortByPriority}>
            Sort by Priority
          </button>

          <button className="btn primary" onClick={handleReverse}>
            Reverse Order
          </button>
        </div>
      </header>

      <section className="grid-3">
        <div className="card">
          <span className="label">Auto-save</span>
          <p className="big mono accent">
            Next auto-save in: {countdown} seconds
          </p>
          <span className="muted small">Saves completed: {saveCount}</span>
          {saveError && <p className="warn">{saveError}</p>}
        </div>

        <div className="card span-2">
          <span className="label">Last Saved Payload</span>
          <pre className="payload mono">
            {lastSavedPayload
              ? JSON.stringify(lastSavedPayload, null, 2)
              : 'Awaiting first auto-save...'}
          </pre>
        </div>
      </section>

      <section className="grid-4">
        <div className="card stat">
          <span className="label">Visible tasks</span>
          <p className="big">{displayedTasks.length}</p>
        </div>

        <div className="card stat">
          <span className="label">Total stock units</span>
          <p className="big">{totalUnits}</p>
        </div>

        <div className="card stat">
          <span className="label">Low stock items</span>
          <p className="big warn">{lowStockCount}</p>
        </div>

        <div className="card stat">
          <span className="label">Completed</span>
          <p className="big ok">{completedCount}</p>
        </div>
      </section>

      <section className="card toolbar">
        <div className="search">
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by title or task code..."
          />
          {isSearching && <span className="querying">Querying...</span>}
        </div>

        <div className="filters">
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="All">All</option>
              <option value="Inventory">Inventory</option>
              <option value="Hardware">Hardware</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </label>

          <label>
            Priority
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="All">All</option>
              <option value="Urgent">Urgent</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </label>
        </div>
      </section>

      <section className="bulkbar">
        <span>
          <strong>{visibleSelectedIds.length}</strong> selected
        </span>

        <div className="actions">
          <button
            className="btn ghost"
            onClick={handleBulkRestock}
            disabled={visibleSelectedIds.length === 0}
          >
            Restock +10
          </button>

          <button
            className="btn ok"
            onClick={handleBulkComplete}
            disabled={visibleSelectedIds.length === 0}
          >
            Mark Complete
          </button>
        </div>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th className="center">Select</th>
              <th>Task ID</th>
              <th>Operational Item</th>
              <th>Category</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Units</th>
              <th>Field Dispatch Notes</th>
            </tr>
          </thead>

          <tbody>
            {displayedTasks.length === 0 ? (
              <tr>
                <td colSpan="8" className="empty">
                  No tasks match the current search or filter criteria.
                </td>
              </tr>
            ) : (
              displayedTasks.map((task) => (
                <tr
                  key={task.id}
                  className={
                    selectedTaskIds.includes(task.id) ? 'selected' : ''
                  }
                >
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.includes(task.id)}
                      onChange={() => handleToggleSelect(task.id)}
                    />
                  </td>

                  <td className="mono strong">{task.id}</td>
                  <td>{task.title}</td>
                  <td className="muted">{task.category}</td>

                  <td>
                    <span className={`pill ${task.priority.toLowerCase()}`}>
                      {task.priority}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`status ${task.status
                        .replace(' ', '')
                        .toLowerCase()}`}
                    >
                      {task.status}
                    </span>
                  </td>

                  <td>
                    <input
                      className="units"
                      type="number"
                      min="0"
                      step="1"
                      value={task.stockUnits}
                      onChange={(event) =>
                        handleStockChange(task.id, event.target.value)
                      }
                      onBlur={() => handleStockBlur(task.id)}
                    />
                  </td>

                  <td>
                    <input
                      className="note"
                      type="text"
                      placeholder="Quick manager note..."
                      value={task.notes || ''}
                      onChange={(event) =>
                        handleNoteChange(task.id, event.target.value)
                      }
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
