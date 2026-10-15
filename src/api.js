
const serverDb = [
  {
    id: 'TSK-101',
    title: 'Audit warehouse safety supplies',
    category: 'Inventory',
    priority: 'High',
    stockUnits: 45,
    status: 'In Progress',
    notes: '',
  },
  {
    id: 'TSK-102',
    title: 'Restock barcode scanner batteries',
    category: 'Hardware',
    priority: 'Urgent',
    stockUnits: 12,
    status: 'Pending',
    notes: '',
  },
  {
    id: 'TSK-103',
    title: 'Recalibrate conveyor scale sensor',
    category: 'Maintenance',
    priority: 'Low',
    stockUnits: 80,
    status: 'Completed',
    notes: '',
  },
  {
    id: 'TSK-104',
    title: 'Inspect forklift hydraulic fluid',
    category: 'Maintenance',
    priority: 'Medium',
    stockUnits: 30,
    status: 'In Progress',
    notes: '',
  },
  {
    id: 'TSK-105',
    title: 'Cycle count shelf aisle B4',
    category: 'Inventory',
    priority: 'High',
    stockUnits: 150,
    status: 'Pending',
    notes: '',
  },
  {
    id: 'TSK-106',
    title: 'Replace thermal printer heads',
    category: 'Hardware',
    priority: 'Urgent',
    stockUnits: 6,
    status: 'Pending',
    notes: '',
  },
  {
    id: 'TSK-107',
    title: 'Label returned pallet inventory',
    category: 'Inventory',
    priority: 'Medium',
    stockUnits: 64,
    status: 'Pending',
    notes: '',
  },
  {
    id: 'TSK-108',
    title: 'Service dock door actuators',
    category: 'Maintenance',
    priority: 'High',
    stockUnits: 9,
    status: 'In Progress',
    notes: '',
  },
  {
    id: 'TSK-109',
    title: 'Update handheld scanner firmware',
    category: 'Hardware',
    priority: 'Low',
    stockUnits: 22,
    status: 'Pending',
    notes: '',
  },
  {
    id: 'TSK-110',
    title: 'Reconcile damaged goods ledger',
    category: 'Inventory',
    priority: 'Urgent',
    stockUnits: 18,
    status: 'Pending',
    notes: '',
  },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const fetchTasks = async (searchQuery = '', category = 'All') => {
  const query = searchQuery.trim().toLowerCase();

  // Deliberate delay to test whether stale search results are ignored.
  await wait(query.length === 1 ? 1800 : 250);

  return serverDb
    .filter((task) => {
      const matchesSearch =
        !query ||
        task.title.toLowerCase().includes(query) ||
        task.id.toLowerCase().includes(query);

      const matchesCategory =
        category === 'All' || task.category === category;

      return matchesSearch && matchesCategory;
    })
    .map((task) => ({ ...task }));
};

export const updateTask = async (id, patch) => {
  const index = serverDb.findIndex((task) => task.id === id);

  if (index === -1) {
    throw new Error(`Task not found: ${id}`);
  }

  // Update synchronously so older delayed updates cannot overwrite newer data.
  serverDb[index] = {
    ...serverDb[index],
    ...patch,
    id: serverDb[index].id,
  };

  return { ...serverDb[index] };
};
