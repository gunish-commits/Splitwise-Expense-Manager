// ═══════════════════════════════════════════════════════════
//  SPLITEASE — script.js
//  Features: member management, expense tracking,
//            debt simplification algorithm, localStorage
// ═══════════════════════════════════════════════════════════

// ─── STATE ──────────────────────────────────────────────────
let members  = JSON.parse(localStorage.getItem('se_members')  || '[]');
let expenses = JSON.parse(localStorage.getItem('se_expenses') || '[]');

// Avatar color palette
const AVATAR_COLORS = [
  '#e8604a', '#2d6a4f', '#3a6ea5', '#7b5ea7',
  '#d4852a', '#c0392b', '#16a085', '#8e44ad',
  '#2980b9', '#d35400'
];

// ─── SAVE ────────────────────────────────────────────────────
function save() {
  localStorage.setItem('se_members',  JSON.stringify(members));
  localStorage.setItem('se_expenses', JSON.stringify(expenses));
}

// ─── TAB SWITCHING ───────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  render();
}

// ─── ADD MEMBER ───────────────────────────────────────────────
function addMember() {
  const input = document.getElementById('memberName');
  const name  = input.value.trim();

  if (!name) { showToast('Enter a name!'); return; }
  if (members.find(m => m.name.toLowerCase() === name.toLowerCase())) {
    showToast('Member already exists!'); return;
  }
  if (members.length >= 10) { showToast('Max 10 members allowed'); return; }

  members.push({
    id:    Date.now(),
    name,
    color: AVATAR_COLORS[members.length % AVATAR_COLORS.length]
  });

  save();
  input.value = '';
  render();
  showToast(`${name} added to group ✓`);
}

// ─── DELETE MEMBER ────────────────────────────────────────────
function confirmDeleteMember(id) {
  const member = members.find(m => m.id === id);
  const hasExp = expenses.some(e => e.paidBy === id || e.splitAmong.includes(id));

  if (hasExp) {
    showModal(
      'Cannot Remove Member',
      `${member.name} is part of existing expenses. Delete those expenses first.`,
      null
    );
    return;
  }

  showModal(
    'Remove Member',
    `Are you sure you want to remove ${member.name} from the group?`,
    () => {
      members = members.filter(m => m.id !== id);
      save();
      render();
      showToast(`${member.name} removed`);
    }
  );
}

// ─── ADD EXPENSE ──────────────────────────────────────────────
function addExpense() {
  const desc     = document.getElementById('expDesc').value.trim();
  const amount   = parseFloat(document.getElementById('expAmount').value);
  const paidById = parseInt(document.getElementById('expPaidBy').value);
  const category = document.getElementById('expCategory').value;

  // Validation
  if (!desc)             { showToast('Enter a description'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount'); return; }
  if (!paidById)         { showToast('Select who paid'); return; }

  const selected = getSelectedSplitMembers();
  if (selected.length === 0) { showToast('Select at least one person to split with'); return; }

  expenses.push({
    id:         Date.now(),
    desc,
    amount,
    paidBy:     paidById,
    category,
    splitAmong: selected,
    date:       new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  });

  save();

  // Clear form
  document.getElementById('expDesc').value   = '';
  document.getElementById('expAmount').value = '';
  document.getElementById('expPaidBy').value = '';
  clearSplit();

  render();
  showToast('Expense added ✓');
}

// ─── DELETE EXPENSE ───────────────────────────────────────────
function confirmDeleteExpense(id) {
  const exp = expenses.find(e => e.id === id);
  showModal(
    'Delete Expense',
    `Delete "${exp.desc}" (₹${fmt(exp.amount)})?`,
    () => {
      expenses = expenses.filter(e => e.id !== id);
      save();
      render();
      showToast('Expense deleted');
    }
  );
}

// ─── SPLIT MEMBER SELECTION ───────────────────────────────────
function getSelectedSplitMembers() {
  return [...document.querySelectorAll('.member-check-pill.selected')]
    .map(el => parseInt(el.dataset.id));
}

function selectAllSplit() {
  document.querySelectorAll('.member-check-pill').forEach(p => p.classList.add('selected'));
}

function clearSplit() {
  document.querySelectorAll('.member-check-pill').forEach(p => p.classList.remove('selected'));
}

function toggleSplitPill(el) {
  el.classList.toggle('selected');
}

// ─── RESET ALL ────────────────────────────────────────────────
function resetAll() {
  showModal(
    'Reset Everything',
    'This will delete all members and expenses permanently. This cannot be undone.',
    () => {
      members  = [];
      expenses = [];
      save();
      render();
      showToast('Everything reset');
    }
  );
}

// ═══════════════════════════════════════════════════════════
//  CORE ALGORITHM — Debt Simplification (Greedy Min Transactions)
//  Steps:
//    1. Compute net balance for each person
//    2. Separate into creditors (+) and debtors (-)
//    3. Greedily match largest debtor to largest creditor
// ═══════════════════════════════════════════════════════════
function computeSettlements() {
  // Step 1: Build net balance map
  const balance = {};
  members.forEach(m => balance[m.id] = 0);

  expenses.forEach(exp => {
    const share = exp.amount / exp.splitAmong.length;
    // Payer gets credited
    balance[exp.paidBy] = (balance[exp.paidBy] || 0) + exp.amount;
    // Each participant gets debited their share
    exp.splitAmong.forEach(pid => {
      balance[pid] = (balance[pid] || 0) - share;
    });
  });

  // Step 2: Separate creditors and debtors
  const creditors = []; // people who are owed money (positive balance)
  const debtors   = []; // people who owe money (negative balance)

  Object.entries(balance).forEach(([id, bal]) => {
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > 0.005)  creditors.push({ id: parseInt(id), amount: rounded });
    if (rounded < -0.005) debtors.push({ id: parseInt(id), amount: -rounded });
  });

  // Step 3: Greedy matching
  const settlements = [];

  // Sort descending for optimal matching
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const cred = creditors[i];
    const debt = debtors[j];
    const settled = Math.min(cred.amount, debt.amount);

    settlements.push({
      from:   debt.id,
      to:     cred.id,
      amount: Math.round(settled * 100) / 100
    });

    cred.amount -= settled;
    debt.amount -= settled;

    if (cred.amount < 0.005) i++;
    if (debt.amount < 0.005) j++;
  }

  return { settlements, balance };
}

// ─── MARK AS SETTLED ─────────────────────────────────────────
function markSettled(fromId, toId, amount) {
  const fromName = getMember(fromId)?.name;
  const toName   = getMember(toId)?.name;

  showModal(
    'Mark as Settled',
    `Has ${fromName} paid ₹${fmt(amount)} to ${toName}?`,
    () => {
      // Add a settlement record as a zero-balance expense
      expenses.push({
        id:         Date.now(),
        desc:       `✅ Settlement: ${fromName} → ${toName}`,
        amount,
        paidBy:     fromId,
        category:   '✅ Settlement',
        splitAmong: [toId],
        date:       new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        isSettlement: true
      });
      save();
      render();
      showToast(`Settlement recorded ✓`);
    }
  );
}

// ─── HELPERS ─────────────────────────────────────────────────
function getMember(id) { return members.find(m => m.id === id); }
function getInitial(name) { return name.charAt(0).toUpperCase(); }
function fmt(n) { return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── TOAST ───────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ─── MODAL ───────────────────────────────────────────────────
let modalCallback = null;

function showModal(title, body, callback) {
  document.getElementById('modalTitle').textContent   = title;
  document.getElementById('modalBody').textContent    = body;
  document.getElementById('modalOverlay').classList.add('open');
  modalCallback = callback;

  const confirmBtn = document.getElementById('modalConfirm');
  confirmBtn.style.display = callback ? 'block' : 'none';
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  modalCallback = null;
}

document.getElementById('modalConfirm').addEventListener('click', () => {
  if (modalCallback) modalCallback();
  closeModal();
});

// ─── MAIN RENDER ─────────────────────────────────────────────
function render() {
  renderSummary();
  renderSplitPills();
  renderPaidByDropdown();
  renderExpenseList();
  renderMemberList();
  renderPerPerson();
  renderSettleTab();
}

// ─── RENDER: SUMMARY CARDS ────────────────────────────────────
function renderSummary() {
  const total = expenses
    .filter(e => !e.isSettlement)
    .reduce((s, e) => s + e.amount, 0);

  document.getElementById('totalSpent').textContent  = '₹' + fmt(total);
  document.getElementById('memberCount').textContent = members.length;
  document.getElementById('txnCount').textContent    = expenses.filter(e => !e.isSettlement).length;
}

// ─── RENDER: SPLIT PILLS ─────────────────────────────────────
function renderSplitPills() {
  const list = document.getElementById('splitAmongList');
  if (members.length === 0) {
    list.innerHTML = '<div class="no-members-hint">Add members first from the Members tab</div>';
    return;
  }
  list.innerHTML = members.map(m => `
    <div class="member-check-pill" data-id="${m.id}" onclick="toggleSplitPill(this)">
      <span class="check-dot"></span>
      ${m.name}
    </div>
  `).join('');
}

// ─── RENDER: PAID BY DROPDOWN ─────────────────────────────────
function renderPaidByDropdown() {
  const sel = document.getElementById('expPaidBy');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Select member</option>' +
    members.map(m => `<option value="${m.id}" ${cur == m.id ? 'selected' : ''}>${m.name}</option>`).join('');
}

// ─── RENDER: EXPENSE LIST ─────────────────────────────────────
function renderExpenseList() {
  const list    = document.getElementById('expenseList');
  const visible = [...expenses].reverse().filter(e => !e.isSettlement);

  document.getElementById('expenseCountBadge').textContent =
    `${visible.length} expense${visible.length !== 1 ? 's' : ''}`;

  if (visible.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🧾</div>
        <div class="empty-title">No expenses yet</div>
        <div class="empty-sub">Add your first expense above</div>
      </div>`;
    return;
  }

  list.innerHTML = visible.map(e => {
    const payer  = getMember(e.paidBy);
    const count  = e.splitAmong.length;
    const each   = e.amount / count;
    const names  = e.splitAmong.map(id => getMember(id)?.name || '?').join(', ');
    const cat    = e.category.split(' ')[0]; // emoji only

    return `
    <div class="expense-item" id="exp-${e.id}">
      <div class="expense-icon">${cat}</div>
      <div class="expense-info">
        <div class="expense-desc">${e.desc}</div>
        <div class="expense-meta">
          <span class="paid-tag">Paid by ${payer?.name || '?'}</span>
          <span class="split-tag">÷ ${count} people</span>
          <span>· ${e.date}</span>
        </div>
        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px">Split: ${names}</div>
      </div>
      <div>
        <div class="expense-amount">₹${fmt(e.amount)}</div>
        <div class="expense-each">₹${fmt(each)}/each</div>
      </div>
      <button class="delete-exp-btn" onclick="confirmDeleteExpense(${e.id})" title="Delete">✕</button>
    </div>`;
  }).join('');
}

// ─── RENDER: MEMBER LIST ─────────────────────────────────────
function renderMemberList() {
  const list = document.getElementById('memberList');
  document.getElementById('memberCountBadge').textContent =
    `${members.length} member${members.length !== 1 ? 's' : ''}`;

  if (members.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">👤</div>
        <div class="empty-title">No members yet</div>
        <div class="empty-sub">Add people to your group first</div>
      </div>`;
    return;
  }

  list.innerHTML = members.map(m => {
    const paid = expenses
      .filter(e => e.paidBy === m.id && !e.isSettlement)
      .reduce((s, e) => s + e.amount, 0);
    const txns = expenses.filter(e => e.splitAmong.includes(m.id) && !e.isSettlement).length;

    return `
    <div class="member-item">
      <div class="member-avatar" style="background:${m.color}">${getInitial(m.name)}</div>
      <div>
        <div class="member-name-label">${m.name}</div>
        <div class="member-stats">Paid ₹${fmt(paid)} · in ${txns} expense${txns !== 1 ? 's' : ''}</div>
      </div>
      <button class="delete-member-btn" onclick="confirmDeleteMember(${m.id})" title="Remove">✕</button>
    </div>`;
  }).join('');
}

// ─── RENDER: PER PERSON SUMMARY ───────────────────────────────
function renderPerPerson() {
  if (members.length === 0) {
    document.getElementById('perPersonCard').style.display = 'none';
    return;
  }

  document.getElementById('perPersonCard').style.display = 'block';
  const { balance } = computeSettlements();

  document.getElementById('perPersonList').innerHTML = members.map(m => {
    const paid  = expenses.filter(e => e.paidBy === m.id && !e.isSettlement).reduce((s, e) => s + e.amount, 0);
    const share = expenses.filter(e => !e.isSettlement).reduce((s, e) => {
      if (e.splitAmong.includes(m.id)) return s + e.amount / e.splitAmong.length;
      return s;
    }, 0);

    const net = Math.round((balance[m.id] || 0) * 100) / 100;
    const cls = net > 0.005 ? 'positive' : net < -0.005 ? 'negative' : 'zero';
    const label = net > 0.005 ? 'gets back' : net < -0.005 ? 'owes' : 'settled';

    return `
    <div class="person-row">
      <div class="member-avatar" style="background:${m.color};width:32px;height:32px;font-size:0.8rem">${getInitial(m.name)}</div>
      <div class="person-name-sm">${m.name}</div>
      <div class="person-paid">
        <div style="font-size:0.78rem;font-weight:700;color:var(--text)">₹${fmt(paid)}</div>
        <div style="font-size:0.62rem;color:var(--text-muted)">paid</div>
      </div>
      <div class="person-share">
        <div style="font-size:0.78rem;font-weight:700;color:var(--text)">₹${fmt(share)}</div>
        <div style="font-size:0.62rem;color:var(--text-muted)">share</div>
      </div>
      <div class="person-balance ${cls}">
        ₹${fmt(Math.abs(net))}
        <span class="person-balance-label">${label}</span>
      </div>
    </div>`;
  }).join('');
}

// ─── RENDER: SETTLE TAB ───────────────────────────────────────
function renderSettleTab() {
  const { settlements, balance } = computeSettlements();

  // Settlement instructions
  const settleList = document.getElementById('settleList');
  if (settlements.length === 0) {
    settleList.innerHTML = `
      <div class="empty-state">
        <div class="empty-emoji">🤝</div>
        <div class="empty-title">All settled up!</div>
        <div class="empty-sub">${expenses.length > 0 ? 'Everyone is even' : 'Add expenses to see settlements'}</div>
      </div>`;
  } else {
    settleList.innerHTML = settlements.map((s, i) => {
      const from = getMember(s.from);
      const to   = getMember(s.to);
      return `
      <div class="settle-item" style="animation-delay:${i * 0.05}s">
        <div class="settle-from">
          <div class="settle-avatar" style="background:${from?.color}">${getInitial(from?.name || '?')}</div>
          <div>
            <div class="settle-name">${from?.name}</div>
            <div class="settle-label">pays</div>
          </div>
        </div>
        <div class="settle-arrow">→</div>
        <div class="settle-from">
          <div class="settle-avatar" style="background:${to?.color}">${getInitial(to?.name || '?')}</div>
          <div>
            <div class="settle-name">${to?.name}</div>
            <div class="settle-label">receives</div>
          </div>
        </div>
        <div class="settle-amount-wrap">
          <div class="settle-amount">₹${fmt(s.amount)}</div>
        </div>
        <button class="settle-mark-btn" onclick="markSettled(${s.from}, ${s.to}, ${s.amount})">
          Mark Paid ✓
        </button>
      </div>`;
    }).join('');
  }

  // Balance sheet
  const maxAbs = Math.max(...members.map(m => Math.abs(balance[m.id] || 0)), 1);

  document.getElementById('balanceSummary').innerHTML = members.length === 0
    ? '<div class="empty-state"><div class="empty-sub">Add members to see balances</div></div>'
    : members.map(m => {
        const net = Math.round((balance[m.id] || 0) * 100) / 100;
        const pct = Math.abs(net) / maxAbs * 100;
        const cls = net > 0.005 ? 'positive' : net < -0.005 ? 'negative' : 'zero';

        return `
        <div class="balance-row">
          <div class="member-avatar" style="background:${m.color};width:28px;height:28px;font-size:0.7rem;flex-shrink:0">${getInitial(m.name)}</div>
          <div class="balance-name">${m.name}</div>
          <div class="balance-bar-wrap">
            <div class="balance-bar-fill ${cls}" style="width:${pct}%"></div>
          </div>
          <div class="balance-val ${cls}">
            ${net > 0.005 ? '+' : ''}₹${fmt(Math.abs(net))}
          </div>
        </div>`;
      }).join('');
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────
document.getElementById('memberName').addEventListener('keydown', e => {
  if (e.key === 'Enter') addMember();
});

document.getElementById('expDesc').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('expAmount').focus();
});

// ─── SEED SAMPLE DATA (first time only) ──────────────────────
if (members.length === 0 && expenses.length === 0) {
  members = [
    { id: 1001, name: 'Gunish',  color: '#e8604a' },
    { id: 1002, name: 'Rahul',   color: '#2d6a4f' },
    { id: 1003, name: 'Priya',   color: '#3a6ea5' },
    { id: 1004, name: 'Arjun',   color: '#7b5ea7' },
  ];

  expenses = [
    {
      id: 2001, desc: 'Dinner at Pizza Hut', amount: 1200,
      paidBy: 1001, category: '🍕 Food',
      splitAmong: [1001, 1002, 1003, 1004],
      date: 'Today', isSettlement: false
    },
    {
      id: 2002, desc: 'Cab to railway station', amount: 450,
      paidBy: 1002, category: '🚗 Travel',
      splitAmong: [1001, 1002, 1003],
      date: 'Yesterday', isSettlement: false
    },
    {
      id: 2003, desc: 'Movie tickets', amount: 800,
      paidBy: 1003, category: '🎮 Entertainment',
      splitAmong: [1002, 1003, 1004],
      date: '3 days ago', isSettlement: false
    },
    {
      id: 2004, desc: 'Groceries for trip', amount: 640,
      paidBy: 1004, category: '🛒 Shopping',
      splitAmong: [1001, 1002, 1003, 1004],
      date: '4 days ago', isSettlement: false
    },
  ];

  save();
}

// ─── INIT ─────────────────────────────────────────────────────
render();
