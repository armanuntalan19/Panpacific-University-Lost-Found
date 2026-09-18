const ITEM_CATEGORIES = [
  { value: "Electronic Device", example: "phone, laptop, charger, earphones, calculator" },
  { value: "Personal Item", example: "wallet, bag, umbrella, water bottle" },
  { value: "Documents / ID", example: "school ID, license, passport, certificate" },
  { value: "Bags / Luggage", example: "backpack, handbag, luggage, pouch" },
  { value: "Clothing / Apparel", example: "jacket, uniform, shoes, cap" },
  { value: "Accessories", example: "watch, jewelry, sunglasses, belt" },
  { value: "Keys", example: "house keys, locker keys, keychains" },
  { value: "Books / School Supplies", example: "notebook, textbook, calculator, pens" },
  { value: "Sports Equipment", example: "ball, racket, gym gear" },
];

function categoryOptionsHtml(selectedValue) {
  return ITEM_CATEGORIES.map((c) =>
    `<option value="${escapeHtml(c.value)}" ${c.value === selectedValue ? "selected" : ""}>${escapeHtml(c.value)} (${escapeHtml(c.example)})</option>`
  ).join("");
}

function formatItemCode(type, itemNumber) {
  return `#${type === "lost" ? "L" : "F"}-${String(itemNumber).padStart(3, "0")}`;
}

async function getSignedPhotoUrl(photoPath) {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage.from("item-photos").createSignedUrl(photoPath, 3600);
  if (error) { console.error("Could not create signed photo URL:", error.message); return null; }
  return data.signedUrl;
}

function renderItemCard(item) {
  const isLost = item.type === "lost";
  return `
    <a href="javascript:void(0)" class="card hover-lift item-card" onclick="return handleItemCardClick(event, '${item.id}')">
      <div class="item-card-noimg"><i class="ti ti-shield-lock"></i></div>
      <div class="item-card-body">
        <span class="badge ${isLost ? "badge-lost" : "badge-found"}">${isLost ? "LOST" : "FOUND"}</span>
        <h3 class="item-card-title">${escapeHtml(item.item_code)}</h3>
        <p class="item-card-meta"><i class="ti ti-tag"></i> ${escapeHtml(item.category)}</p>
        <p class="item-card-meta"><i class="ti ti-calendar"></i> ${formatDate(item.item_date)}</p>
        <span class="badge badge-${item.status}">${item.status}</span>
      </div>
    </a>`;
}

function showPostSubmitNotice(type, itemCode) {
  const isFound = type === "found";
  const codeLine = itemCode ? `Your report is <strong>${escapeHtml(itemCode)}</strong>. ` : "";
  const message = isFound
    ? `${codeLine}Please bring the found item to the CSS Office so it can be kept safe. An admin or authorized staff will check it first before it shows up here.`
    : `${codeLine}An admin or staff will check it first before it goes live. After that, check the Found Items page to see if your item is already there. If not, please wait. We will let you know if we find a match.`;

  const existing = el("postSubmitToast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "postSubmitToast";
  toast.className = "post-submit-toast";
  toast.innerHTML = `
    <i class="ti ${isFound ? "ti-building-bank" : "ti-search"}"></i>
    <span>${message}</span>
    <button type="button" class="post-submit-toast-close" aria-label="Dismiss"><i class="ti ti-x"></i></button>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));

  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector(".post-submit-toast-close").addEventListener("click", dismiss);
  setTimeout(dismiss, 7000);
}

async function fetchItems(filters = {}) {
  let query = supabase.from("items_view").select("*")
    .in("status", ["active", "claimed", "returned"])
    .order("created_at", { ascending: false });

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) { console.error("Error loading items:", error.message); return []; }
  return data;
}

function cleanInput(input, errorId, allowedPattern, message) {
  const cleaned = input.value.replace(allowedPattern, "");
  const hadInvalidChar = cleaned !== input.value;
  if (hadInvalidChar) {
    const pos = input.selectionStart - (input.value.length - cleaned.length);
    input.value = cleaned;
    input.setSelectionRange(pos, pos);
  }
  showFieldError(errorId, hadInvalidChar, message);
}

function sanitizeLettersInput(input, errorId) {
  cleanInput(input, errorId, /[^A-Za-z\s.'-]/g, "Letters only - numbers and symbols aren't allowed here.");
}

function sanitizeNumbersInput(input, errorId) {
  cleanInput(input, errorId, /[^0-9+\-\s()]/g, "Numbers only - letters and symbols aren't allowed here.");
}

const _fieldErrorTimers = {};
function showFieldError(errorId, show, message) {
  if (!errorId) return;
  const box = el(errorId);
  if (!box) return;
  if (_fieldErrorTimers[errorId]) clearTimeout(_fieldErrorTimers[errorId]);
  if (!show) { box.classList.remove("show"); return; }
  box.textContent = message;
  box.classList.add("show");
  _fieldErrorTimers[errorId] = setTimeout(() => box.classList.remove("show"), 2500);
}

function isPlainLeftClick(e) {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1);
}

function closeAnyModal(overlayId) { closeOverlay(overlayId); }
function closeItemModal() { closeAnyModal("itemModal"); }
function closeReportModal() { closeAnyModal("reportModal"); }
function closeClaimModal() { closeAnyModal("claimModal"); }

function handleItemCardClick(e, itemId) {
  if (!isPlainLeftClick(e)) return true;
  e.preventDefault();
  openItemModal(itemId);
  return false;
}

function handleReportLinkClick(e, type) {
  if (!isPlainLeftClick(e)) return true;
  e.preventDefault();
  openReportModal(type);
  return false;
}

function ensureItemModal() {
  if (el("itemModal")) return;
  addOverlay(`
    <div class="modal-overlay" id="itemModal">
      <div class="modal-box modal-xl">
        <div class="modal-header">
          <h3><i class="ti ti-info-circle"></i> Item Details</h3>
          <button type="button" class="modal-close" id="itemModalClose"><i class="ti ti-x"></i></button>
        </div>
        <div id="itemModalBody"><p class="loading-text">Loading item…</p></div>
      </div>
    </div>`, "itemModal", "itemModalClose");
}

function ensureReportModal() {
  if (el("reportModal")) return;
  addOverlay(`
    <div class="modal-overlay" id="reportModal">
      <div class="modal-box modal-lg">
        <div class="modal-header">
          <h3 id="reportModalTitle"><i class="ti ti-alert-circle"></i> Report an Item</h3>
          <button type="button" class="modal-close" id="reportModalClose"><i class="ti ti-x"></i></button>
        </div>
        <div id="reportModalBody"></div>
      </div>
    </div>`, "reportModal", "reportModalClose");
}

function ensureClaimModal() {
  if (el("claimModal")) return;
  addOverlay(`
    <div class="modal-overlay" id="claimModal">
      <div class="modal-box modal-lg">
        <div class="modal-header">
          <h3><i class="ti ti-message-2"></i> I Think This Is My Item</h3>
          <button type="button" class="modal-close" id="claimModalClose"><i class="ti ti-x"></i></button>
        </div>
        <div id="claimModalBody"></div>
      </div>
    </div>`, "claimModal", "claimModalClose");
}

function itemDetailsHtml(item, withClaimSection) {
  const isLost = item.type === "lost";
  const badgeClass = isLost ? "badge-lost" : "badge-found";
  const badgeLabel = isLost ? "LOST ITEM" : "FOUND ITEM";
  const claimSlot = withClaimSection ? `\n      <div id="itemModalClaimSection" class="modal-claim-section"></div>` : "";
  const hasPrivateAccess = item.description !== null && item.description !== undefined;

  if (!hasPrivateAccess) {
    return `
      <div class="modal-item-info">
        <span class="badge ${badgeClass}">${badgeLabel}</span>
        <h2 class="modal-item-title">${escapeHtml(item.item_code)}</h2>
        <p class="modal-item-meta"><i class="ti ti-tag"></i> ${escapeHtml(item.category)}</p>
        <p class="modal-item-meta"><i class="ti ti-calendar"></i> ${formatDate(item.item_date)}</p>
        <span class="badge badge-${item.status}">${item.status}</span>
        <p class="form-hint form-hint-block"><i class="ti ti-shield-lock"></i> Additional information (photo, location, description) is restricted for security and verification purposes.</p>
      </div>${claimSlot}`;
  }

  const contactLabel = isLost ? "Reporter" : "Finder";
  const contactBits = [item.contact_name, item.contact_email, item.contact_phone].filter(Boolean);
  return `
      <div id="modalPhotoSlot" class="modal-item-noimg"><i class="ti ti-photo"></i>${item.photo_path ? "" : '<span class="modal-photo-missing">Photo: Not Provided</span>'}</div>
      <div class="modal-item-info">
        <span class="badge ${badgeClass}">${badgeLabel}</span>
        <h2 class="modal-item-title">${escapeHtml(item.item_code)}</h2>
        <p class="modal-item-meta"><i class="ti ti-tag"></i> ${escapeHtml(item.category)}</p>
        <p class="modal-item-meta">
          <i class="ti ti-map-pin"></i> ${escapeHtml(item.location)} &nbsp;&middot;&nbsp; <i class="ti ti-calendar"></i> ${formatDate(item.item_date)}${item.approx_time ? ` &nbsp;&middot;&nbsp; <i class="ti ti-clock"></i> ${escapeHtml(item.approx_time)}` : ""}
        </p>
        <p class="modal-item-desc"><strong>Description:</strong> ${escapeHtml(item.description)}</p>
        ${item.color ? `<p class="modal-item-meta"><i class="ti ti-palette"></i> Color: ${escapeHtml(item.color)}</p>` : ""}
        ${item.unique_characteristics ? `<p class="modal-item-meta"><i class="ti ti-fingerprint"></i> Unique characteristics: ${escapeHtml(item.unique_characteristics)}</p>` : ""}
        ${item.additional_info ? `<p class="modal-item-meta"><i class="ti ti-info-circle"></i> Additional info: ${escapeHtml(item.additional_info)}</p>` : ""}
        ${contactBits.length ? `<p class="modal-item-contact"><i class="ti ti-user"></i> ${contactLabel}: ${escapeHtml(contactBits.join(" · "))}</p>` : ""}
        <p class="form-hint"><i class="ti ti-shield-lock"></i> This full detail view is only visible to you (the reporter) and Admin/Authorized Staff.</p>
      </div>${claimSlot}`;
}

async function fillItemModal(itemId, withClaimSection) {
  const body = el("itemModalBody");
  const { data: item, error } = await supabase.from("items_view").select("*").eq("id", itemId).single();

  if (error || !item) {
    body.innerHTML = `<div class="empty-state"><div class="icon"><i class="ti ti-mood-empty"></i></div><p>This item could not be found.</p></div>`;
    return null;
  }

  body.innerHTML = itemDetailsHtml(item, withClaimSection);

  if (item.description !== null && item.description !== undefined && item.photo_path) {
    getSignedPhotoUrl(item.photo_path).then((url) => {
      const slot = el("modalPhotoSlot");
      if (slot && url) slot.outerHTML = `<img src="${url}" alt="${escapeHtml(item.item_code)}" class="modal-item-img">`;
    });
  }

  return item;
}

const OPTIONAL_TAG = '<span class="text-muted-light">(optional)</span>';

function formField(label, icon, control, options = {}) {
  return `
      <div class="form-group">
        <label>${label}</label>
        <div class="input-wrap"><i class="ti ${icon}"></i>${control}</div>
        ${options.errorId ? `<span class="field-error" id="${options.errorId}"></span>` : ""}
        ${options.hint ? `<p class="form-hint">${options.hint}</p>` : ""}
      </div>`;
}

function formRow(leftField, rightField) {
  return `<div class="form-row">${leftField}${rightField}</div>`;
}