let currentAdmin = null;
let currentItemFilter = "all";

const MANUAL_PAGE_SIZE = 10;
let manualPage = 1;
let manualFilters = { search: "", type: "lost", category: "", status: "", date: "" };

function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function emptyStateHtml(icon, text) {
  return `<div class="empty-state"><div class="icon"><i class="ti ${icon}"></i></div><p>${text}</p></div>`;
}

function compareField(label, value) {
  return `<div class="compare-field"><span class="compare-label">${label}</span><span>${value}</span></div>`;
}

function photoHtml(photoUrl, altText) {
  return photoUrl
    ? `<img class="modal-item-img" src="${photoUrl}" alt="${altText}" />`
    : `<div class="modal-item-noimg"><i class="ti ti-photo-off"></i></div>`;
}

(async function () {
  currentAdmin = await requireLogin(["admin"]);
  if (!currentAdmin) return;
  await initNavbar("admin");

  setupTabs();
  setupItemFilter();
  setupManualFilters();
  loadPendingReports();
  loadPossibleMatches();
  loadManualMatching();
  loadAllItems();
  loadClaims();
  loadUsers();
  loadActivityLog();

  el("openAddAccountBtn").addEventListener("click", openAddAccountModal);
})();

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn[data-tab]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      el("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  document.querySelectorAll("[data-goto-tab]").forEach((card) => {
    const jump = () => {
      const target = document.querySelector(`.tab-btn[data-tab="${card.dataset.gotoTab}"]`);
      if (target) target.click();
    };
    card.addEventListener("click", jump);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(); }
    });
  });
}

function setupItemFilter() {
  const buttons = document.querySelectorAll("[data-item-filter]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentItemFilter = btn.dataset.itemFilter;
      loadAllItems();
    });
  });
}

function setTabCount(elId, count) {
  const badge = el(elId);
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

async function notifyUser(userId, title, message, type, relatedItemId) {
  await supabase.from("notifications").insert({
    user_id: userId, title, message, type, related_item_id: relatedItemId || null,
  });
}

async function loadPendingReports() {
  const { data, error } = await supabase.from("items_view").select("*")
    .eq("status", "pending").order("created_at", { ascending: true });

  const list = el("pendingList");
  el("statPendingReports").textContent = error ? "–" : data.length;
  setTabCount("tabCountPending", error ? 0 : data.length);

  if (error) { list.innerHTML = `<p class="loading-text">Could not load reports.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-circle-check", "No reports waiting for review."); return; }

  list.innerHTML = data.map((r) => `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title">${escapeHtml(r.item_code)} <span class="badge ${r.type === "lost" ? "badge-lost" : "badge-found"}">${r.type}</span></div>
        <div class="list-meta"><i class="ti ti-tag"></i> ${escapeHtml(r.category)} &middot; <i class="ti ti-map-pin"></i> ${escapeHtml(r.location)} &middot; <i class="ti ti-calendar"></i> ${formatDate(r.item_date)}</div>
        <div class="list-meta">${escapeHtml(r.description)}</div>
      </div>
      <div class="list-actions">
        <button class="btn btn-primary btn-sm" data-approve="${r.id}"><i class="ti ti-check"></i> Approve</button>
        <button class="btn btn-danger btn-sm" data-reject="${r.id}"><i class="ti ti-x"></i> Reject</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-approve]").forEach((btn) =>
    btn.addEventListener("click", () => updateReportStatus(btn.dataset.approve, "active", "approved", btn)));
  list.querySelectorAll("[data-reject]").forEach((btn) =>
    btn.addEventListener("click", () => updateReportStatus(btn.dataset.reject, "rejected", "rejected", btn)));
}

async function updateReportStatus(itemId, newStatus, notifType, triggerBtn) {
  const row = triggerBtn ? triggerBtn.closest(".list-row") : null;
  const setRowDisabled = (disabled) => {
    if (row) row.querySelectorAll("[data-approve], [data-reject]").forEach((b) => (b.disabled = disabled));
  };
  setRowDisabled(true);

  const { data: item } = await supabase.from("items").select("*").eq("id", itemId).single();
  if (!item || item.status !== "pending") { loadPendingReports(); return; }

  const { error } = await supabase.from("items").update({ status: newStatus }).eq("id", itemId);
  if (error) {
    alert("Error: " + error.message);
    setRowDisabled(false);
    return;
  }

  const itemCode = formatItemCode(item.type, item.item_number);
  const approved = notifType === "approved";

  if (item.reported_by) {
    await notifyUser(
      item.reported_by,
      approved ? "Report Approved" : "Report Rejected",
      approved
        ? `Your report ${itemCode} is now live.`
        : `Your report ${itemCode} was rejected. Please submit a new report with complete and accurate information for review.`,
      notifType, itemId
    );
  }

  await logActivity(currentAdmin, approved ? "Approved Report" : "Rejected Report", itemCode);
  loadPendingReports();
  loadAllItems();
}

function daysBetween(dateA, dateB) {
  return Math.abs(new Date(dateA) - new Date(dateB)) / (1000 * 60 * 60 * 24);
}

function isMatch(lost, found) {
  if (lost.category !== found.category) return false;
  if (daysBetween(lost.item_date, found.item_date) > 7) return false;

  const lostLocation = (lost.location || "").trim().toLowerCase();
  const foundLocation = (found.location || "").trim().toLowerCase();
  return !lostLocation || !foundLocation || lostLocation === foundLocation;
}

async function loadPossibleMatches() {
  const list = el("matchesList");

  const { data: items, error } = await supabase.from("items_view").select("*").eq("status", "active");
  if (error) { list.innerHTML = `<p class="loading-text">Could not load items.</p>`; return; }

  const lostItems = items.filter((i) => i.type === "lost");
  const foundItems = items.filter((i) => i.type === "found");

  const candidatePairs = [];
  lostItems.forEach((lost) => {
    foundItems.forEach((found) => {
      if (isMatch(lost, found)) candidatePairs.push({ lost, found });
    });
  });

  const { data: existingMatches } = await supabase.from("possible_matches").select("*");
  const existingKeys = new Set((existingMatches || []).map((m) => `${m.lost_item_id}:${m.found_item_id}`));

  for (const pair of candidatePairs) {
    if (existingKeys.has(`${pair.lost.id}:${pair.found.id}`)) continue;

    const { error: insertError } = await supabase.from("possible_matches")
      .insert({ lost_item_id: pair.lost.id, found_item_id: pair.found.id });
    if (!insertError) {
      await logActivity(currentAdmin, "Possible Match Created", `${pair.lost.item_code} ↔ ${pair.found.item_code}`);
    }
  }

  const itemColumns = "id, item_number, type, category, location, item_date, reported_by, status";
  const { data: rawMatches, error: matchError } = await supabase.from("possible_matches")
    .select(`*, lost_item:lost_item_id(${itemColumns}), found_item:found_item_id(${itemColumns})`)
    .eq("status", "active").order("created_at", { ascending: true });

  if (matchError) { list.innerHTML = `<p class="loading-text">Could not load possible matches.</p>`; setTabCount("tabCountMatches", 0); return; }

  const activeMatches = rawMatches.filter(
    (m) => m.lost_item && m.lost_item.status === "active" && m.found_item && m.found_item.status === "active"
  );

  el("statMatches").textContent = activeMatches.length;
  setTabCount("tabCountMatches", activeMatches.length);

  if (!activeMatches.length) { list.innerHTML = emptyStateHtml("ti-git-compare", "No likely matches right now."); return; }

  const notifiedFoundIds = activeMatches.filter((m) => m.notified_at).map((m) => m.found_item.id);
  const claimedAtByKey = {};
  if (notifiedFoundIds.length) {
    const { data: relatedClaims } = await supabase.from("claims")
      .select("item_id, user_id, created_at").in("item_id", notifiedFoundIds);
    (relatedClaims || []).forEach((c) => {
      const key = `${c.item_id}:${c.user_id}`;
      if (!claimedAtByKey[key] || new Date(c.created_at) > new Date(claimedAtByKey[key])) {
        claimedAtByKey[key] = c.created_at;
      }
    });
  }

  const RENOTIFY_AFTER_HOURS = 24;

  list.innerHTML = activeMatches.map((m) => {
    const lostCode = formatItemCode(m.lost_item.type, m.lost_item.item_number);
    const foundCode = formatItemCode(m.found_item.type, m.found_item.item_number);

    const notifiedAt = m.notified_at ? new Date(m.notified_at) : null;
    const claimedAtRaw = notifiedAt ? claimedAtByKey[`${m.found_item.id}:${m.lost_item.reported_by || ""}`] : null;
    const alreadyClaimed = !!(claimedAtRaw && new Date(claimedAtRaw) >= notifiedAt);
    const hoursSinceNotify = notifiedAt ? (Date.now() - notifiedAt.getTime()) / 3600000 : null;
    const canRenotify = !!(notifiedAt && !alreadyClaimed && hoursSinceNotify >= RENOTIFY_AFTER_HOURS);

    let notifyStatusMeta = "";
    if (notifiedAt) {
      const statusTail = alreadyClaimed ? "claim submitted"
        : canRenotify ? "no claim after 24h, you can notify again"
        : "awaiting response";
      notifyStatusMeta = `<div class="list-meta"><i class="ti ti-bell-check"></i> Owner notified ${formatDateTime(notifiedAt)} &middot; ${statusTail}</div>`;
    }

    const side = (badge, code, item, extraMeta = "") => `
      <div class="list-main">
        <div class="list-title"><span class="badge badge-${badge}">${badge.toUpperCase()}</span> ${escapeHtml(code)}</div>
        <div class="list-meta"><i class="ti ti-tag"></i> ${escapeHtml(item.category)} &middot; <i class="ti ti-map-pin"></i> ${escapeHtml(item.location)} &middot; <i class="ti ti-calendar"></i> ${formatDate(item.item_date)}</div>
        ${extraMeta}
      </div>`;

    return `
    <div class="list-row">
      ${side("lost", lostCode, m.lost_item)}
      <i class="ti ti-arrow-right icon-muted"></i>
      ${side("found", foundCode, m.found_item, notifyStatusMeta)}
      <div class="list-actions">
        <button class="btn btn-primary btn-sm" data-compare-match data-lost-item="${m.lost_item.id}" data-found-item="${m.found_item.id}" data-match-id="${m.id}" data-notified-at="${notifiedAt ? notifiedAt.toISOString() : ""}" data-can-renotify="${canRenotify ? "1" : "0"}" data-already-claimed="${alreadyClaimed ? "1" : "0"}"><i class="ti ti-git-compare"></i> Compare</button>
        <button class="btn btn-danger btn-sm" data-delete-match="${m.id}" data-lost-code="${escapeHtml(lostCode)}" data-found-code="${escapeHtml(foundCode)}"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll("[data-compare-match]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCompareModal(btn.dataset.lostItem, btn.dataset.foundItem, "possible", btn.dataset.matchId, {
        notifiedAt: btn.dataset.notifiedAt || null,
        canRenotify: btn.dataset.canRenotify === "1",
        alreadyClaimed: btn.dataset.alreadyClaimed === "1",
      });
    });
  });

  list.querySelectorAll("[data-delete-match]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this possible match?")) return;
      await supabase.from("possible_matches").update({ status: "deleted" }).eq("id", btn.dataset.deleteMatch);
      await logActivity(currentAdmin, "Possible Match Deleted", `${btn.dataset.lostCode} ↔ ${btn.dataset.foundCode}`);
      loadPossibleMatches();
    });
  });
}

async function notifyMatchOwner(matchId, lost, found) {
  if (!lost.reported_by) { alert("This lost report has no owner on file."); return; }

  await notifyUser(
    lost.reported_by,
    "Possible Match Found",
    `A found item, ${found.item_code} (${found.category}), might match your lost report ${lost.item_code}. If you believe this item is yours, please submit a claim for verification.`,
    "match", found.id
  );

  const now = new Date().toISOString();
  await supabase.from("possible_matches").update({
    notified_at: now, matched_by_admin_id: currentAdmin.user.id, reviewed_at: now,
  }).eq("id", matchId);

  await logActivity(currentAdmin, "Owner Notified of Possible Match", `${lost.item_code} ↔ ${found.item_code}`);
  loadPossibleMatches();
}

async function markMatchNotAMatch(matchId, lostCode, foundCode) {
  await supabase.from("possible_matches").update({
    status: "not_a_match", matched_by_admin_id: currentAdmin.user.id, reviewed_at: new Date().toISOString(),
  }).eq("id", matchId);

  await logActivity(currentAdmin, "Possible Match Marked Not a Match", `${lostCode} ↔ ${foundCode}`);
  loadPossibleMatches();
}

function setupManualFilters() {
  populateManualCategoryFilter();

  const searchInput = el("manualSearchInput");
  const typeFilter = el("manualTypeFilter");
  const categoryFilter = el("manualCategoryFilter");
  const statusFilter = el("manualStatusFilter");
  const dateFilter = el("manualDateFilter");

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      manualFilters.search = searchInput.value;
      manualPage = 1;
      loadManualMatching();
    }, 300);
  });

  const simpleFilters = [
    [typeFilter, "type"],
    [categoryFilter, "category"],
    [statusFilter, "status"],
    [dateFilter, "date"],
  ];
  simpleFilters.forEach(([field, key]) => {
    field.addEventListener("change", () => {
      manualFilters[key] = field.value;
      if (key === "type") applyManualStatusFilterForType();
      manualPage = 1;
      loadManualMatching();
    });
  });

  el("manualClearFiltersBtn").addEventListener("click", () => {
    manualFilters = { search: "", type: "lost", category: "", status: "", date: "" };
    searchInput.value = "";
    typeFilter.value = "lost";
    categoryFilter.value = "";
    dateFilter.value = "";
    applyManualStatusFilterForType();
    manualPage = 1;
    loadManualMatching();
  });

  applyManualStatusFilterForType();
}

function applyManualStatusFilterForType() {
  const statusFilter = el("manualStatusFilter");
  const isLost = manualFilters.type === "lost";
  statusFilter.value = isLost ? "active" : "";
  manualFilters.status = isLost ? "active" : "";
  statusFilter.hidden = isLost;
}

function populateManualCategoryFilter() {
  const select = el("manualCategoryFilter");
  ITEM_CATEGORIES.forEach((c) => {
    const option = document.createElement("option");
    option.value = c.value;
    option.textContent = c.value;
    select.appendChild(option);
  });
}

async function loadManualMatching() {
  const list = el("manualMatchingList");
  list.innerHTML = `<p class="loading-text">Loading…</p>`;

  let query = supabase.from("items_view").select("*")
    .eq("type", manualFilters.type).not("status", "in", "(pending,rejected)");
  if (manualFilters.category) query = query.eq("category", manualFilters.category);
  if (manualFilters.status) query = query.eq("status", manualFilters.status);
  if (manualFilters.date) query = query.eq("item_date", manualFilters.date);
  query = query.order("item_date", { ascending: false });

  const { data, error } = await query;
  if (error) {
    list.innerHTML = `<p class="loading-text">Could not load reports.</p>`;
    el("manualPagination").hidden = true;
    return;
  }

  const search = manualFilters.search.trim().toLowerCase();
  const filtered = search
    ? data.filter((r) =>
        r.item_code.toLowerCase().includes(search) ||
        r.category.toLowerCase().includes(search) ||
        (r.description || "").toLowerCase().includes(search))
    : data;

  renderManualPagination(filtered.length);

  if (!filtered.length) {
    list.innerHTML = emptyStateHtml("ti-search-off", `No ${manualFilters.type} reports match these filters.`);
    return;
  }

  const start = (manualPage - 1) * MANUAL_PAGE_SIZE;
  list.innerHTML = filtered.slice(start, start + MANUAL_PAGE_SIZE).map(renderManualReportRow).join("");

  list.querySelectorAll("[data-find-matches]").forEach((btn) =>
    btn.addEventListener("click", () => toggleFindMatches(btn)));
}

function renderManualPagination(totalCount) {
  const wrap = el("manualPagination");
  const totalPages = Math.max(1, Math.ceil(totalCount / MANUAL_PAGE_SIZE));
  if (manualPage > totalPages) manualPage = totalPages;

  if (totalCount <= MANUAL_PAGE_SIZE) { wrap.hidden = true; wrap.innerHTML = ""; return; }

  wrap.hidden = false;
  wrap.innerHTML = `
    <button type="button" class="btn btn-outline btn-sm" id="manualPrevBtn" ${manualPage <= 1 ? "disabled" : ""}><i class="ti ti-chevron-left"></i> Prev</button>
    <span>Page ${manualPage} of ${totalPages}</span>
    <button type="button" class="btn btn-outline btn-sm" id="manualNextBtn" ${manualPage >= totalPages ? "disabled" : ""}>Next <i class="ti ti-chevron-right"></i></button>`;

  el("manualPrevBtn").addEventListener("click", () => { manualPage--; loadManualMatching(); });
  el("manualNextBtn").addEventListener("click", () => { manualPage++; loadManualMatching(); });
}

function renderManualReportRow(r) {
  const locationKnown = !!(r.location && r.location.trim());
  return `
  <div class="list-row manual-report-row">
    <div class="list-main">
      <div class="list-title">
        ${escapeHtml(r.item_code)}
        <span class="badge ${r.type === "lost" ? "badge-lost" : "badge-found"}">${r.type}</span>
        <span class="badge badge-${r.status}">${r.status}</span>
      </div>
      <div class="list-meta">
        <i class="ti ti-tag"></i> ${escapeHtml(r.category)}
        &middot; <i class="ti ti-calendar"></i> ${formatDate(r.item_date)}
        &middot; <i class="ti ti-map-pin"></i> Location: ${locationKnown ? "Provided" : "Unknown"}
      </div>
      <div class="list-meta">${escapeHtml(r.description)}</div>
    </div>
    <div class="list-actions">
      ${r.status === "returned" ? "" : `<button class="btn btn-outline btn-sm" data-find-matches="${r.id}" data-report-type="${r.type}"><i class="ti ti-search"></i> Find Matches</button>`}
    </div>
  </div>
  <div class="manual-candidates" id="manualCandidates-${r.id}" hidden></div>`;
}

async function toggleFindMatches(btn) {
  const reportId = btn.dataset.findMatches;
  const reportType = btn.dataset.reportType;
  const container = el(`manualCandidates-${reportId}`);
  if (!container) return;

  if (!container.hidden) { container.hidden = true; return; }
  container.hidden = false;
  if (container.dataset.loaded === "true") return;

  container.innerHTML = `<p class="loading-text">Searching for candidates…</p>`;

  const { data: report } = await supabase.from("items_view").select("*").eq("id", reportId).single();
  if (!report) { container.innerHTML = `<p class="loading-text">Could not load this report.</p>`; return; }

  const oppositeType = reportType === "lost" ? "found" : "lost";
  const { data: candidates, error } = await supabase.from("items_view").select("*")
    .eq("type", oppositeType).eq("status", "active");

  if (error) { container.innerHTML = `<p class="loading-text">Could not load candidates.</p>`; return; }

  const scored = candidates
    .map((c) => ({ item: c, score: scoreCandidate(report, c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  container.dataset.loaded = "true";

  if (!scored.length) {
    container.innerHTML = emptyStateHtml("ti-mood-empty", `No ${oppositeType} reports to compare right now.`);
    return;
  }

  container.innerHTML = `
    <p class="manual-candidates-title">Possible ${oppositeType === "found" ? "Found" : "Lost"} Reports</p>
    ${scored.map(({ item }) => `
      <div class="list-row manual-candidate-row">
        <div class="list-main">
          <div class="list-title">${escapeHtml(item.item_code)}</div>
          <div class="list-meta">
            <i class="ti ti-tag"></i> ${escapeHtml(item.category)}
            &middot; <i class="ti ti-calendar"></i> ${formatDate(item.item_date)}
            &middot; <i class="ti ti-map-pin"></i> ${item.location ? escapeHtml(item.location) : "Location unknown"}
          </div>
        </div>
        <div class="list-actions">
          <button class="btn btn-primary btn-sm" data-manual-compare
            data-lost="${reportType === "lost" ? reportId : item.id}"
            data-found="${reportType === "lost" ? item.id : reportId}">
            <i class="ti ti-git-compare"></i> Compare
          </button>
        </div>
      </div>`).join("")}`;

  container.querySelectorAll("[data-manual-compare]").forEach((compareBtn) => {
    compareBtn.addEventListener("click", () =>
      openCompareModal(compareBtn.dataset.lost, compareBtn.dataset.found, "manual"));
  });
}

function scoreCandidate(a, b) {
  let score = 0;
  if (a.category === b.category) score += 3;

  const apart = daysBetween(a.item_date, b.item_date);
  if (apart <= 7) score += 2;
  else if (apart <= 14) score += 1;

  const aLocation = (a.location || "").trim().toLowerCase();
  const bLocation = (b.location || "").trim().toLowerCase();
  if (aLocation && bLocation && aLocation === bLocation) score += 2;

  return score;
}

async function createManualPossibleMatch(lost, found) {
  const { data: existing } = await supabase.from("possible_matches").select("id")
    .eq("lost_item_id", lost.id).eq("found_item_id", found.id).maybeSingle();

  const matchData = { match_type: "manual", matched_by_admin_id: currentAdmin.user.id };

  if (existing) {
    await supabase.from("possible_matches").update({ status: "active", ...matchData }).eq("id", existing.id);
  } else {
    await supabase.from("possible_matches").insert({ lost_item_id: lost.id, found_item_id: found.id, ...matchData });
  }

  await logActivity(currentAdmin, "Possible Match Created", `${lost.item_code} ↔ ${found.item_code} (manual)`);
  alert(`Possible Match created for ${lost.item_code} ↔ ${found.item_code}. Review it in the Possible Matches tab.`);
  loadPossibleMatches();
}

function ensureCompareModal() {
  if (el("compareModal")) return;
  addOverlay(`
    <div class="modal-overlay" id="compareModal">
      <div class="modal-box modal-xl">
        <div class="modal-header">
          <h3><i class="ti ti-git-compare"></i> Compare Reports</h3>
          <button type="button" class="modal-close" id="compareModalClose"><i class="ti ti-x"></i></button>
        </div>
        <div class="compare-grid" id="compareGrid"></div>
        <div class="compare-actions" id="compareActions"></div>
      </div>
    </div>`, "compareModal", "compareModalClose");
}

function closeCompareModal() { closeOverlay("compareModal"); }

async function openCompareModal(lostItemId, foundItemId, mode, matchId, notifyMeta) {
  ensureCompareModal();

  const grid = el("compareGrid");
  const actions = el("compareActions");
  grid.innerHTML = `<p class="loading-text">Loading comparison…</p>`;
  actions.innerHTML = "";
  openOverlay("compareModal");

  const [{ data: lost }, { data: found }] = await Promise.all([
    supabase.from("items_view").select("*").eq("id", lostItemId).single(),
    supabase.from("items_view").select("*").eq("id", foundItemId).single(),
  ]);

  if (!lost || !found) { grid.innerHTML = `<p class="loading-text">Could not load one or both reports.</p>`; return; }

  const [lostPhotoUrl, foundPhotoUrl] = await Promise.all([
    getSignedPhotoUrl(lost.photo_path),
    getSignedPhotoUrl(found.photo_path),
  ]);

  grid.innerHTML = renderCompareColumn("Lost Report", lost, lostPhotoUrl) +
    renderCompareColumn("Found Report", found, foundPhotoUrl);

  const notMatchBtn = `<button type="button" class="btn btn-outline btn-sm" id="compareNotMatchBtn"><i class="ti ti-x"></i> Not a Match</button>`;

  if (mode !== "possible") {
    actions.innerHTML = `
      ${notMatchBtn}
      <button type="button" class="btn btn-primary btn-sm" id="comparePossibleMatchBtn"><i class="ti ti-git-compare"></i> Possible Match</button>`;

    el("compareNotMatchBtn").addEventListener("click", closeCompareModal);
    el("comparePossibleMatchBtn").addEventListener("click", async () => {
      await createManualPossibleMatch(lost, found);
      closeCompareModal();
    });
    return;
  }

  const notifiedAt = notifyMeta && notifyMeta.notifiedAt ? new Date(notifyMeta.notifiedAt) : null;
  const alreadyClaimed = !!(notifyMeta && notifyMeta.alreadyClaimed);
  const canRenotify = !!(notifyMeta && notifyMeta.canRenotify);
  const stillWaiting = !!notifiedAt && !alreadyClaimed && !canRenotify;

  const notifyLabel = !notifiedAt ? "Notify Owner" : canRenotify ? "Notify Again" : "Notified";
  const notifyDisabled = !lost.reported_by || stillWaiting || alreadyClaimed;
  const notifyClass = !notifiedAt || canRenotify ? "btn-accent" : "btn-outline";

  let noteHtml = "";
  if (notifiedAt) {
    const tail = alreadyClaimed ? "They've since submitted a claim - check the Claims tab."
      : canRenotify ? "It's been over 24 hours with no claim submitted, so you can notify them again."
      : "Give them up to 24 hours to respond before notifying again.";
    noteHtml = `<p class="form-hint compare-notify-note"><i class="ti ti-info-circle"></i> You already notified the owner on ${formatDateTime(notifiedAt)}. ${tail}</p>`;
  }

  actions.innerHTML = `
      ${noteHtml}
      ${notMatchBtn}
      <button type="button" class="btn ${notifyClass} btn-sm" id="compareNotifyBtn" ${notifyDisabled ? "disabled" : ""}><i class="ti ti-bell"></i> ${notifyLabel}</button>`;

  el("compareNotMatchBtn").addEventListener("click", async () => {
    await markMatchNotAMatch(matchId, lost.item_code, found.item_code);
    closeCompareModal();
  });
  el("compareNotifyBtn").addEventListener("click", async () => {
    await notifyMatchOwner(matchId, lost, found);
    closeCompareModal();
  });
}

function renderCompareColumn(label, item, photoUrl) {
  const isLost = label === "Lost Report";
  const contact = escapeHtml(item.contact_name || "—") +
    (item.contact_email ? " &middot; " + escapeHtml(item.contact_email) : "") +
    (item.contact_phone ? " &middot; " + escapeHtml(item.contact_phone) : "");

  return `
    <div class="compare-col ${isLost ? "" : "compare-col-found"}">
      <div class="compare-col-title">
        <span class="badge ${isLost ? "badge-lost" : "badge-found"}">${label}</span> ${escapeHtml(item.item_code)}
      </div>
      ${photoHtml(photoUrl, `${escapeHtml(item.item_code)} photo`)}
      ${!item.photo_path ? compareField("Photo", "Not Provided") : ""}
      ${compareField("Category", escapeHtml(item.category))}
      ${compareField(`Date/Time ${isLost ? "Lost" : "Found"}`, formatDate(item.item_date) + (item.approx_time ? ` &middot; ${escapeHtml(item.approx_time)}` : ""))}
      ${compareField(`Location ${isLost ? "Lost" : "Found"}`, item.location ? escapeHtml(item.location) : "Unknown")}
      ${compareField("Full Description", escapeHtml(item.description))}
      ${item.color ? compareField("Color", escapeHtml(item.color)) : ""}
      ${item.unique_characteristics ? compareField("Unique Characteristics / Distinguishing Marks", escapeHtml(item.unique_characteristics)) : ""}
      ${item.additional_info ? compareField("Accessories / Contents / Other Info", escapeHtml(item.additional_info)) : ""}
      ${compareField(isLost ? "Contact Information" : "Finder Information", contact)}
    </div>`;
}

function ensureClaimViewModal() {
  if (el("claimViewModal")) return;
  addOverlay(`
    <div class="modal-overlay" id="claimViewModal">
      <div class="modal-box modal-xl">
        <div class="modal-header">
          <h3><i class="ti ti-git-compare"></i> Claim vs. Original Report</h3>
          <button type="button" class="modal-close" id="claimViewModalClose"><i class="ti ti-x"></i></button>
        </div>
        <div class="compare-grid" id="claimViewGrid"></div>
      </div>
    </div>`, "claimViewModal", "claimViewModalClose");
}

function closeClaimViewModal() { closeOverlay("claimViewModal"); }

async function openClaimViewModal(claim) {
  ensureClaimViewModal();

  const grid = el("claimViewGrid");
  grid.innerHTML = `<p class="loading-text">Loading comparison…</p>`;
  openOverlay("claimViewModal");

  const itemCode = claim.items ? formatItemCode(claim.items.type, claim.items.item_number) : "Item Removed";

  const [claimPhotoUrl, itemPhotoUrl] = await Promise.all([
    getSignedPhotoUrl(claim.claim_photo_path),
    claim.items ? getSignedPhotoUrl(claim.items.photo_path) : Promise.resolve(null),
  ]);

  grid.innerHTML = renderClaimAnswerColumn(claim, claimPhotoUrl) +
    renderClaimReportColumn(claim.items, itemPhotoUrl, itemCode);
}

function orNotProvided(value, formatter) {
  return value ? (formatter ? formatter(value) : escapeHtml(value)) : "Not Provided";
}

function renderClaimAnswerColumn(claim, photoUrl) {
  return `
    <div class="compare-col">
      <div class="compare-col-title"><span class="badge badge-lost">Claimant's Answers</span> ${escapeHtml(claim.claimant_name)}</div>
      ${photoHtml(photoUrl, "Claimant's photo")}
      ${!claim.claim_photo_path ? compareField("Photo", "Not Provided") : ""}
      ${compareField("University Email", escapeHtml(claim.claimant_contact))}
      ${compareField("Description", escapeHtml(claim.claim_description))}
      ${compareField("Location", orNotProvided(claim.claim_where_lost))}
      ${compareField("Date", orNotProvided(claim.claim_when_lost, formatDate))}
      ${compareField("Color", orNotProvided(claim.claim_color))}
      ${compareField("Unique Characteristics", escapeHtml(claim.claim_characteristics))}
      ${compareField("Additional Info", orNotProvided(claim.claim_additional_info))}
    </div>`;
}

function renderClaimReportColumn(item, photoUrl, itemCode) {
  if (!item) {
    return `
      <div class="compare-col compare-col-found">
        <div class="compare-col-title"><span class="badge badge-found">Original Report</span></div>
        <p class="loading-text">This item report no longer exists.</p>
      </div>`;
  }
  return `
    <div class="compare-col compare-col-found">
      <div class="compare-col-title"><span class="badge badge-found">Original Report</span> ${escapeHtml(itemCode)}</div>
      ${photoHtml(photoUrl, `${escapeHtml(itemCode)} photo`)}
      ${!item.photo_path ? compareField("Photo", "Not Provided") : ""}
      ${compareField("Category", escapeHtml(item.category))}
      ${compareField("Description", escapeHtml(item.description))}
      ${compareField("Location", item.location ? escapeHtml(item.location) : "Unknown")}
      ${compareField("Date", formatDate(item.item_date))}
      ${compareField("Color", orNotProvided(item.color))}
      ${compareField("Unique Characteristics", orNotProvided(item.unique_characteristics))}
      ${compareField("Additional Info", orNotProvided(item.additional_info))}
    </div>`;
}

async function loadAllItems() {
  const visibleStatuses = ["active", "claimed", "returned"];

  let query = supabase.from("items_view").select("*").in("status", visibleStatuses).order("item_date", { ascending: false });
  if (currentItemFilter !== "all") query = query.eq("type", currentItemFilter);

  const { data, error } = await query;
  const list = el("allItemsList");
  el("allItemsCount").textContent = error ? "Could not load count." : `${data.length} item(s) shown.`;

  const { count: totalCount, error: totalError } = await supabase.from("items")
    .select("*", { count: "exact", head: true }).in("status", visibleStatuses);
  el("statAllItems").textContent = totalError ? "–" : totalCount;

  if (error) { list.innerHTML = `<p class="loading-text">Could not load items.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-package-off", "No items yet."); return; }

  list.innerHTML = data.map((r) => `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title">${escapeHtml(r.item_code)} <span class="badge ${r.type === "lost" ? "badge-lost" : "badge-found"}">${r.type}</span></div>
        <div class="list-meta"><i class="ti ti-tag"></i> ${escapeHtml(r.category)} &middot; <i class="ti ti-map-pin"></i> ${escapeHtml(r.location)} &middot; <i class="ti ti-calendar"></i> ${formatDate(r.item_date)}</div>
      </div>
      <span class="badge badge-${r.status}">${r.status}</span>
      <div class="list-actions">
        ${(r.status === "active" || r.status === "claimed") && r.type === "found"
          ? `<button class="btn btn-outline btn-sm" data-returned="${r.id}"><i class="ti ti-rotate"></i> Mark Returned</button>`
          : ""}
        <button class="btn btn-danger btn-sm" data-delete="${r.id}"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-returned]").forEach((btn) =>
    btn.addEventListener("click", () => markItemReturned(btn.dataset.returned)));

  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this item permanently?")) return;
      await supabase.from("items").delete().eq("id", btn.dataset.delete);
      loadAllItems();
    });
  });
}

async function markItemReturned(itemId) {
  const { data: item } = await supabase.from("items").select("*").eq("id", itemId).single();
  await supabase.from("items").update({ status: "returned" }).eq("id", itemId);

  const itemCode = formatItemCode(item.type, item.item_number);
  if (item && item.reported_by) {
    await notifyUser(item.reported_by, "Item Returned", `${itemCode} has been marked as returned.`, "returned", itemId);
  }

  if (item && item.type === "found") {
    await supabase.from("possible_matches")
      .update({ status: "deleted", reviewed_at: new Date().toISOString() })
      .eq("found_item_id", itemId).eq("status", "active");
  }

  await logActivity(currentAdmin, "Marked Item as Returned", itemCode);
  loadAllItems();
}

async function loadClaims() {
  const { data, error } = await supabase.from("claims")
    .select("*, items(item_number, type, category, location, item_date, description, color, unique_characteristics, additional_info, photo_path)")
    .order("created_at", { ascending: true });

  const list = el("claimsAdminList");
  const pendingCount = error ? 0 : data.filter((c) => c.status === "pending").length;
  el("statPendingClaims").textContent = error ? "–" : pendingCount;
  setTabCount("tabCountClaims", pendingCount);

  if (error) { list.innerHTML = `<p class="loading-text">Could not load claims.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-file-off", "No claims submitted yet."); return; }

  list.innerHTML = data.map((c, i) => {
    const itemCode = c.items ? formatItemCode(c.items.type, c.items.item_number) : "Item removed";
    return `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title">${escapeHtml(itemCode)}</div>
        <div class="list-meta">Claim from <strong>${escapeHtml(c.claimant_name)}</strong> &middot; <strong>${escapeHtml(c.claimant_contact)}</strong> in <strong>${escapeHtml(itemCode)}</strong>. Click View for more info.</div>
      </div>
      <span class="badge badge-${c.status}">${c.status}</span>
      <div class="list-actions">
        <button class="btn btn-outline btn-sm" data-claim-view="${i}"><i class="ti ti-git-compare"></i> View</button>
        ${c.status === "pending" ? `
          <button class="btn btn-primary btn-sm" data-claim-approve="${c.id}" data-item="${c.item_id}" data-user="${c.user_id}"><i class="ti ti-check"></i> Approve</button>
          <button class="btn btn-danger btn-sm" data-claim-reject="${c.id}" data-user="${c.user_id}"><i class="ti ti-x"></i> Reject</button>` : ""}
        <button class="btn btn-danger btn-sm" data-claim-delete="${c.id}"><i class="ti ti-trash"></i> Delete</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll("[data-claim-view]").forEach((btn) =>
    btn.addEventListener("click", () => openClaimViewModal(data[btn.dataset.claimView])));

  list.querySelectorAll("[data-claim-approve]").forEach((btn) =>
    btn.addEventListener("click", () => decideClaim(btn, true)));

  list.querySelectorAll("[data-claim-reject]").forEach((btn) =>
    btn.addEventListener("click", () => decideClaim(btn, false)));

  list.querySelectorAll("[data-claim-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this claim permanently? This cannot be undone.")) return;
      const claimId = btn.dataset.claimDelete;
      const claim = data.find((c) => c.id === claimId);
      const itemCode = claim && claim.items ? formatItemCode(claim.items.type, claim.items.item_number) : "Item removed";

      const { error: deleteError } = await supabase.from("claims").delete().eq("id", claimId);
      if (deleteError) { alert("Could not delete this claim: " + deleteError.message); return; }

      await logActivity(currentAdmin, "Deleted Claim", itemCode);
      loadClaims();
    });
  });
}

async function decideClaim(btn, approve) {
  const row = btn.closest(".list-row");
  if (row) row.querySelectorAll("[data-claim-approve], [data-claim-reject]").forEach((b) => (b.disabled = true));

  const claimId = approve ? btn.dataset.claimApprove : btn.dataset.claimReject;
  const userId = btn.dataset.user;

  const { data: claim } = await supabase.from("claims").select("status, item_id").eq("id", claimId).single();
  if (!claim || claim.status !== "pending") { loadClaims(); return; }

  const itemId = approve ? btn.dataset.item : claim.item_id;
  const { data: claimedItem } = await supabase.from("items").select("type, item_number").eq("id", itemId).single();
  const itemCode = claimedItem ? formatItemCode(claimedItem.type, claimedItem.item_number) : "";

  await supabase.from("claims").update({ status: approve ? "approved" : "rejected" }).eq("id", claimId);

  if (approve) {
    await supabase.from("items").update({ status: "claimed" }).eq("id", itemId);
    await notifyUser(userId, "Claim Approved", "Your claim has been approved. Please go to the CSS office to claim your lost item.", "claim");
  } else {
    await notifyUser(userId, "Claim Rejected", "Your claim was rejected. Please go to the CSS office or contact CSS office for details.", "claim");
  }

  await logActivity(currentAdmin, approve ? "Approved Claim" : "Rejected Claim", itemCode);
  loadClaims();
  if (approve) loadAllItems();
}

async function loadUsers() {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  const list = el("usersList");
  el("statTotalUsers").textContent = error ? "–" : data.length;

  if (error) { list.innerHTML = `<p class="loading-text">Could not load users.</p>`; return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentClaims } = await supabase.from("claims").select("user_id").gte("created_at", thirtyDaysAgo);

  const claimCounts = {};
  (recentClaims || []).forEach((c) => { claimCounts[c.user_id] = (claimCounts[c.user_id] || 0) + 1; });
  const EXCESSIVE_CLAIMS_THRESHOLD = 3;

  const roleOption = (user, value, label) => `<option value="${value}" ${user.role === value ? "selected" : ""}>${label}</option>`;

  list.innerHTML = data.map((u) => {
    const claimCount = claimCounts[u.id] || 0;
    const isYou = u.id === currentAdmin.user.id;

    return `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title">
          ${escapeHtml(u.full_name)}
          ${isYou ? '<span class="you-badge">You</span>' : ""}
          ${u.is_flagged ? '<span class="flag-badge"><i class="ti ti-flag-filled"></i> Flagged</span>' : ""}
          ${claimCount >= EXCESSIVE_CLAIMS_THRESHOLD ? `<span class="flag-badge flag-badge-warning"><i class="ti ti-alert-triangle"></i> ${claimCount} claims this month</span>` : ""}
        </div>
        <div class="list-meta">${escapeHtml(u.email)}</div>
      </div>
      <div class="list-actions">
        <button class="btn btn-sm ${u.is_flagged ? "btn-danger" : "btn-outline"}" data-toggle-flag="${u.id}" data-flagged="${u.is_flagged}" ${isYou ? "disabled" : ""}>
          <i class="ti ti-flag"></i> ${u.is_flagged ? "Unflag" : "Flag"}
        </button>
        <select class="role-select" data-user="${u.id}" ${isYou ? "disabled title=\"You can't change your own role\"" : ""}>
          ${roleOption(u, "student", "Student")}
          ${roleOption(u, "staff", "Staff")}
          ${roleOption(u, "admin", "Admin")}
        </select>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".role-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const { error: roleError } = await supabase.from("profiles").update({ role: sel.value }).eq("id", sel.dataset.user);
      if (roleError) alert("Error updating role: " + roleError.message);
    });
  });

  list.querySelectorAll("[data-toggle-flag]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isCurrentlyFlagged = btn.dataset.flagged === "true";
      const { error: flagError } = await supabase.from("profiles")
        .update({ is_flagged: !isCurrentlyFlagged }).eq("id", btn.dataset.toggleFlag);
      if (flagError) { alert("Error updating flag: " + flagError.message); return; }
      loadUsers();
    });
  });
}

function ensureAddAccountModal() {
  if (el("addAccountModal")) return;
  addOverlay(`
    <div class="modal-overlay" id="addAccountModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3><i class="ti ti-user-plus"></i> Add Staff / Admin Account</h3>
          <button type="button" class="modal-close" id="addAccountModalClose"><i class="ti ti-x"></i></button>
        </div>
        <form id="addAccountForm">
          <div class="alert alert-error" id="addAccountAlert"></div>
          <div class="alert alert-success" id="addAccountSuccess"></div>
          ${formField("Full Name", "ti-user", `<input type="text" id="newAccFullName" placeholder="Juan Dela Cruz" required />`)}
          ${formField("Email", "ti-mail", `<input type="email" id="newAccEmail" placeholder="you@panpacificu.edu.ph" required />`,
            { hint: `Must end in ${ALLOWED_EMAIL_DOMAIN}` })}
          ${formField("Temporary Password", "ti-lock", `<input type="password" id="newAccPassword" minlength="${PASSWORD_MIN_LENGTH}" required />`,
            { hint: `${PASSWORD_HINT_TEXT} Share this with them so they can log in and change it.` })}
          <div class="form-group">
            <label>Role</label>
            <select class="role-select role-select-block" id="newAccRole">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary btn-block" id="addAccountBtn">
            <i class="ti ti-user-plus"></i> Create Account
          </button>
        </form>
      </div>
    </div>`, "addAccountModal", "addAccountModalClose");

  el("addAccountForm").addEventListener("submit", handleAddAccount);
}

function openAddAccountModal() {
  ensureAddAccountModal();
  el("addAccountForm").reset();
  hideAlert("addAccountAlert");
  hideAlert("addAccountSuccess");
  openOverlay("addAccountModal");
}

function closeAddAccountModal() { closeOverlay("addAccountModal"); }

async function handleAddAccount(e) {
  e.preventDefault();
  hideAlert("addAccountAlert");
  hideAlert("addAccountSuccess");

  const fullName = val("newAccFullName");
  const email = val("newAccEmail");
  const password = el("newAccPassword").value;
  const role = el("newAccRole").value;

  if (!email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
    return showAlert("addAccountAlert", `Please use a ${ALLOWED_EMAIL_DOMAIN} email address.`);
  }

  const passwordCheck = validatePassword(password);
  if (!passwordCheck.valid) return showAlert("addAccountAlert", passwordCheck.message);

  const btn = el("addAccountBtn");
  setBtn(btn, `<span class="btn-spinner"></span> Creating…`, true);

  const { data: { session: adminSession } } = await supabase.auth.getSession();

  const { error } = await supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName, role } },
  });

  if (adminSession) {
    await supabase.auth.setSession({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    });
  }

  setBtn(btn, `<i class="ti ti-user-plus"></i> Create Account`, false);
  if (error) return showAlert("addAccountAlert", error.message);

  showAlert("addAccountSuccess", `${role === "admin" ? "Admin" : "Staff"} account created for ${fullName}. Share the temporary password with them.`);
  el("addAccountForm").reset();
  loadUsers();
}

async function loadActivityLog() {
  const { data, error } = await supabase.from("activity_log").select("*")
    .order("created_at", { ascending: false }).limit(100);

  const list = el("activityList");

  if (error) { list.innerHTML = `<p class="loading-text">Could not load activity history.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-history", "No activity recorded yet."); return; }

  list.innerHTML = data.map((entry) => `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title"><i class="ti ti-user"></i> ${escapeHtml(entry.actor_name)}</div>
        <div class="list-meta">${escapeHtml(entry.action)}${entry.target_code ? ` &middot; ${escapeHtml(entry.target_code)}` : ""}</div>
      </div>
      <div class="list-meta">${formatDate(entry.created_at)}</div>
    </div>`).join("");
}