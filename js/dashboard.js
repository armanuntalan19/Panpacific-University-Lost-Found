(async function () {
  const current = await requireLogin();
  if (!current) return;
  await initNavbar("dashboard");

  el("welcomeText").textContent = `Welcome, ${current.profile.full_name.split(" ")[0]}!`;

  setupTabs();
  loadReports(current.user.id);
  loadClaims(current.user.id);
  loadNotifications(current.user.id);

  const openNotifsIfHashed = () => {
    if (window.location.hash === "#notifications") document.querySelector('[data-tab="notifications"]').click();
  };
  openNotifsIfHashed();
  window.addEventListener("hashchange", openNotifsIfHashed);
})();

window.goToDashboardNotifications = function () {
  const btn = document.querySelector('[data-tab="notifications"]');
  if (btn) btn.click();
  if (window.location.hash !== "#notifications") window.location.hash = "notifications";
};

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
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

function emptyStateHtml(icon, text) {
  return `<div class="empty-state"><div class="icon"><i class="ti ${icon}"></i></div><p>${text}</p></div>`;
}

async function loadReports(userId) {
  const { data, error } = await supabase.from("items_view").select("*")
    .eq("reported_by", userId).order("created_at", { ascending: false });

  const list = el("reportsList");
  el("statReports").textContent = error ? "–" : data.length;

  if (error) { list.innerHTML = `<p class="loading-text">Could not load reports.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-clipboard-list", "You haven't reported any items yet."); return; }

  list.innerHTML = data.map((r) => `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title">${escapeHtml(r.item_code)} <span class="badge ${r.type === "lost" ? "badge-lost" : "badge-found"}">${r.type}</span></div>
        <div class="list-meta"><i class="ti ti-tag"></i> ${escapeHtml(r.category)} &middot; <i class="ti ti-calendar"></i> ${formatDate(r.item_date)}</div>
      </div>
      <span class="badge badge-${r.status}">${r.status}</span>
      <div class="list-actions">
        <button class="btn btn-outline btn-sm" data-edit-report="${r.id}"><i class="ti ti-pencil"></i> Edit</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-edit-report]").forEach((btn) => {
    btn.addEventListener("click", () => openEditReportModal(btn.dataset.editReport, userId));
  });
}

async function loadClaims(userId) {
  const { data, error } = await supabase.from("claims")
    .select("*, items(item_number, type, category)")
    .eq("user_id", userId).order("created_at", { ascending: false });

  const list = el("claimsList");
  el("statClaims").textContent = error ? "–" : data.length;

  if (error) { list.innerHTML = `<p class="loading-text">Could not load claims.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-file-check", "You haven't submitted any claims yet."); return; }

  list.innerHTML = data.map((c) => `
    <div class="list-row">
      <div class="list-main">
        <div class="list-title">${escapeHtml(c.items ? formatItemCode(c.items.type, c.items.item_number) : "Item removed")}</div>
        <div class="list-meta">${escapeHtml(c.claim_description)}</div>
      </div>
      <span class="badge badge-${c.status}">${c.status}</span>
    </div>`).join("");
}

async function loadNotifications(userId) {
  const { data, error } = await supabase.from("notifications").select("*")
    .eq("user_id", userId).order("created_at", { ascending: false });

  const list = el("notifsList");
  el("statNotifs").textContent = error ? "–" : data.filter((n) => !n.is_read).length;

  if (error) { list.innerHTML = `<p class="loading-text">Could not load notifications.</p>`; return; }
  if (!data.length) { list.innerHTML = emptyStateHtml("ti-bell", "No notifications yet."); return; }

  list.innerHTML = data.map((n) => {
    const canOpenItem = !!n.related_item_id && n.type !== "rejected";
    return `
    <div class="list-row notif-row ${n.is_read ? "read" : "unread"}" data-id="${n.id}" data-item="${canOpenItem ? n.related_item_id : ""}">
      <div class="list-main">
        <div class="list-title">${escapeHtml(n.title)}<span class="notif-dot"></span></div>
        <div class="list-meta">${escapeHtml(n.message)}</div>
        <div class="list-meta">${formatDate(n.created_at)}</div>
      </div>
      ${canOpenItem ? `<i class="ti ti-chevron-right icon-muted"></i>` : ""}
    </div>`;
  }).join("");

  document.querySelectorAll(".notif-row").forEach((row) => {
    if (row.dataset.item) row.classList.add("is-clickable");
    row.addEventListener("click", async () => {
      if (row.classList.contains("unread")) {
        await supabase.from("notifications").update({ is_read: true }).eq("id", row.dataset.id);
        row.classList.remove("unread");
        row.classList.add("read");

        const statNotifsEl = el("statNotifs");
        if (statNotifsEl) {
          statNotifsEl.textContent = Math.max(0, (parseInt(statNotifsEl.textContent, 10) || 0) - 1);
        }
        if (typeof loadNotificationBadge === "function") loadNotificationBadge(userId);
      }
      if (row.dataset.item) openItemModal(row.dataset.item);
    });
  });
}

async function openItemModal(itemId) {
  ensureItemModal();
  el("itemModalBody").innerHTML = `<p class="loading-text">Loading item…</p>`;
  openOverlay("itemModal");

  const current = await getCurrentProfile();
  const item = await fillItemModal(itemId, true);
  if (item) renderItemModalClaimSection(item, current);
}

async function getSavedContactInfoModal(userId) {
  const { data, error } = await supabase.from("items")
    .select("contact_name, contact_phone, contact_email")
    .eq("reported_by", userId).order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  if (error || !data) return "";
  return data.contact_email || data.contact_phone || "";
}

async function renderItemModalClaimSection(item, current) {
  const section = el("itemModalClaimSection");
  if (!section) return;

  if (item.type === "lost" || item.status !== "active" || (current && item.reported_by === current.user.id)) {
    section.innerHTML = "";
    return;
  }

  if (!current) {
    section.innerHTML = `
      <div class="modal-center-note">
        <p class="modal-note-text">Log in with your Panpacific University email to claim this item.</p>
        <a href="index.html" class="btn btn-primary modal-note-btn"><i class="ti ti-login-2"></i> Log In</a>
      </div>`;
    return;
  }

  section.innerHTML = `
    <h3 class="modal-section-title"><i class="ti ti-message-2"></i> Is this yours?</h3>
    <p class="form-hint form-hint-block">Fill in a claim form describing the item yourself, Authorized Staff use it to verify you're the real owner.</p>
    <button class="btn btn-accent btn-block" id="openClaimModalBtn"><i class="ti ti-message-2"></i> I Think This Is My Item</button>`;

  el("openClaimModalBtn").addEventListener("click", () => openClaimModal(item, current));
}

async function openClaimModal(item, current) {
  ensureClaimModal();
  openOverlay("claimModal");

  const savedContact = await getSavedContactInfoModal(current.user.id);

  el("claimModalBody").innerHTML = `
    <p class="modal-form-intro">Claiming <strong>${escapeHtml(item.item_code)}</strong>. Describe the item yourself - the system never shows you the real description first, so Authorized Staff can tell a genuine owner from a guess.</p>
    <form id="claimModalForm">
      <div class="alert alert-error" id="claimModalAlert"></div>
      <div class="alert alert-success" id="claimModalSuccess"></div>
      ${formField("Your Full Name", "ti-user",
        `<input type="text" id="claimModalName" value="${escapeHtml(current.profile.full_name)}" oninput="sanitizeLettersInput(this, 'claimModalNameError')" required />`,
        { errorId: "claimModalNameError" })}
      ${formField("University Email", "ti-mail",
        `<input type="text" id="claimModalContact" placeholder="you@panpacificu.edu.ph" value="${escapeHtml(savedContact)}" required />`)}
      ${formField("Describe the Item", "ti-notes",
        `<textarea id="claimModalDescription" placeholder="What is it, and what does it look like?" required></textarea>`)}
      ${formRow(
        formField("Where Did You Lose It?", "ti-map-pin", `<input type="text" id="claimModalWhere" placeholder="e.g. Library, 2nd floor" required />`),
        formField("When Did You Lose It?", "ti-calendar", `<input type="date" id="claimModalWhen" />`)
      )}
      ${formRow(
        formField("Color", "ti-palette",
          `<input type="text" id="claimModalColor" placeholder="e.g. Black, Red, Silver" oninput="sanitizeLettersInput(this, 'claimModalColorError')" required />`,
          { errorId: "claimModalColorError" }),
        formField("Describe Its Unique Characteristics", "ti-fingerprint",
          `<textarea id="claimModalCharacteristics" placeholder="A scratch, a sticker, what's inside, a keychain…" required></textarea>`)
      )}
      ${formField(`Additional Information ${OPTIONAL_TAG}`, "ti-info-circle",
        `<textarea id="claimModalAdditional" placeholder="Anything else that can help verify ownership…"></textarea>`)}
      ${formField(`Photo ${OPTIONAL_TAG}`, "ti-camera", `<input type="file" id="claimModalPhoto" accept="image/*" />`)}
      <button type="submit" class="btn btn-accent btn-block" id="claimModalSubmitBtn"><i class="ti ti-send"></i> Submit Claim</button>
    </form>`;

  el("claimModalForm").addEventListener("submit", (e) => submitClaim(e, item, current));
}

async function submitClaim(e, item, current) {
  e.preventDefault();
  hideAlert("claimModalAlert");
  hideAlert("claimModalSuccess");

  const claim = {
    item_id: item.id,
    user_id: current.user.id,
    claimant_name: val("claimModalName"),
    claimant_contact: val("claimModalContact"),
    claim_description: val("claimModalDescription"),
    claim_characteristics: val("claimModalCharacteristics"),
    claim_color: val("claimModalColor"),
    claim_when_lost: el("claimModalWhen").value || null,
    claim_where_lost: val("claimModalWhere"),
    claim_additional_info: val("claimModalAdditional") || null,
    claim_photo_path: null,
  };
  const photoFile = el("claimModalPhoto").files[0];

  if (!claim.claimant_name || !claim.claimant_contact || !claim.claim_description ||
      !claim.claim_characteristics || !claim.claim_color || !claim.claim_where_lost) {
    showAlert("claimModalAlert", "Please fill in your name, contact info, and every required field below.");
    return;
  }

  const btn = el("claimModalSubmitBtn");
  const sendLabel = `<i class="ti ti-send"></i> Submit Claim`;
  setBtn(btn, `<span class="btn-spinner"></span> Submitting…`, true);

  if (photoFile) {
    claim.claim_photo_path = `${current.user.id}/${Date.now()}-${photoFile.name}`;
    const { error: uploadError } = await supabase.storage.from("item-photos").upload(claim.claim_photo_path, photoFile);
    if (uploadError) {
      showAlert("claimModalAlert", "Could not upload photo: " + uploadError.message);
      setBtn(btn, sendLabel, false);
      return;
    }
  }

  const { error } = await supabase.from("claims").insert(claim);
  if (error) {
    showAlert("claimModalAlert", error.code === "23505"
      ? "You've already submitted a claim for this item."
      : "Something went wrong: " + error.message);
    setBtn(btn, sendLabel, false);
    return;
  }

  showAlert("claimModalSuccess", "Your claim was submitted! Authorized Staff will review it soon.");
  await logActivity(current, "Submitted a Claim", item.item_code);
  document.querySelectorAll("#claimModalForm input, #claimModalForm textarea, #claimModalForm button")
    .forEach((field) => (field.disabled = true));

  setTimeout(() => { closeClaimModal(); closeItemModal(); }, 2500);
}

function reportFormHtml(isLost, item) {
  const photoLabel = item
    ? '<span class="text-muted-light">(optional - leave blank to keep current photo)</span>'
    : isLost ? OPTIONAL_TAG : "";
  const photoHint = isLost
    ? "Optional, but helps Admin/Authorized Staff verify a claim faster. Private, visible only to Admin/Authorized Staff and you."
    : "Required for Found Item reports. Private, visible only to Admin/Authorized Staff and you.";

  return `
    ${formField("Category", "ti-category", `
          <select id="reportModalCategory" required>
            <option value="" disabled ${!item ? "selected" : ""}>Select a category…</option>
            ${categoryOptionsHtml(item ? item.category : null)}
          </select>`)}
    ${formField("Description", "ti-notes", `<textarea id="reportModalDescription" placeholder="What is it? Brand, type, general look…" required></textarea>`)}
    ${formRow(
      formField(isLost ? "Location Lost" : "Location Found", "ti-map-pin",
        `<input type="text" id="reportModalLocation" placeholder="${isLost ? "e.g. Library, 2nd floor" : "e.g. Cafeteria, near counter"}" required />`),
      formField(isLost ? "Date Lost" : "Date Found", "ti-calendar", `<input type="date" id="reportModalDate" required />`)
    )}
    ${formField(`${isLost ? "Approximate Time Lost" : "Approximate Time Found"} ${OPTIONAL_TAG}`, "ti-clock",
      `<input type="text" id="reportModalApproxTime" placeholder="e.g. 2:00 PM" />`)}

    <p class="form-hint form-hint-block"><i class="ti ti-fingerprint"></i> Identification info below is private - only Admin/Authorized Staff (or you) can ever see it. It's used to verify a claim, never shown publicly.</p>

    ${formRow(
      formField("Color", "ti-palette",
        `<input type="text" id="reportModalColor" placeholder="e.g. Black" oninput="sanitizeLettersInput(this, 'reportModalColorError')" />`,
        { errorId: "reportModalColorError" }),
      formField("Unique Characteristics", "ti-fingerprint", `<input type="text" id="reportModalCharacteristics" placeholder="A scratch, sticker, dent…" />`)
    )}
    ${formField(`Additional Information ${OPTIONAL_TAG}`, "ti-info-circle",
      `<textarea id="reportModalAdditional" placeholder="Accessories, contents, anything else that helps identify it…"></textarea>`)}
    ${formField(`Photo ${photoLabel}`, "ti-camera",
      `<input type="file" id="reportModalPhoto" accept="image/*" ${!item && !isLost ? "required" : ""} />`,
      { hint: `<i class="ti ti-shield-lock"></i> ${photoHint}` })}

    <p class="form-hint form-hint-block">${isLost ? "Contact Information" : "Finder Information"}</p>

    ${formField("Name", "ti-user",
      `<input type="text" id="reportModalContactName" placeholder="Juan Dela Cruz" oninput="sanitizeLettersInput(this, 'reportModalContactNameError')" required />`,
      { errorId: "reportModalContactNameError" })}
    ${formRow(
      formField("University Email", "ti-mail", `<input type="email" id="reportModalContactEmail" placeholder="you@panpacificu.edu.ph" required />`),
      formField(`Phone ${OPTIONAL_TAG}`, "ti-phone",
        `<input type="text" id="reportModalContactPhone" placeholder="09XX XXX XXXX" inputmode="tel" oninput="sanitizeNumbersInput(this, 'reportModalContactPhoneError')" />`,
        { errorId: "reportModalContactPhoneError" })
    )}`;
}

function readReportForm() {
  return {
    category: el("reportModalCategory").value,
    description: val("reportModalDescription"),
    location: val("reportModalLocation"),
    item_date: el("reportModalDate").value,
    approx_time: val("reportModalApproxTime"),
    color: val("reportModalColor"),
    unique_characteristics: val("reportModalCharacteristics"),
    additional_info: val("reportModalAdditional"),
    contact_name: val("reportModalContactName"),
    contact_email: val("reportModalContactEmail"),
    contact_phone: val("reportModalContactPhone"),
    photoFile: el("reportModalPhoto").files[0],
  };
}

async function openReportModal(type) {
  ensureReportModal();
  openOverlay("reportModal");

  const isLost = type === "lost";
  el("reportModalTitle").innerHTML = isLost
    ? `<i class="ti ti-alert-circle icon-danger"></i> Report a Lost Item`
    : `<i class="ti ti-package icon-success"></i> Report a Found Item`;

  const body = el("reportModalBody");
  body.innerHTML = `<p class="loading-text">Loading…</p>`;

  const current = await getCurrentProfile();
  if (!current) {
    body.innerHTML = `
      <div class="modal-center-note">
        <p class="modal-note-text">Log in with your Panpacific University email to report an item.</p>
        <a href="index.html" class="btn btn-primary modal-note-btn"><i class="ti ti-login-2"></i> Log In</a>
      </div>`;
    return;
  }

  body.innerHTML = `
    <p class="modal-form-intro">Please fill in every field below. Identification details stay private and are only used to verify a future claim.</p>
    <form id="reportModalForm">
      <div class="alert alert-error" id="reportModalAlert"></div>
      <div class="alert alert-success" id="reportModalSuccess"></div>
      ${reportFormHtml(isLost, null)}
      <button type="submit" class="btn btn-primary btn-block" id="reportModalSubmitBtn"><i class="ti ti-device-floppy"></i> Submit Report</button>
    </form>`;

  el("reportModalContactName").value = current.profile.full_name || "";
  el("reportModalContactEmail").value = current.profile.email || "";

  el("reportModalForm").addEventListener("submit", (e) => submitReport(e, type, isLost, current));
}

async function submitReport(e, type, isLost, current) {
  e.preventDefault();
  hideAlert("reportModalAlert");
  hideAlert("reportModalSuccess");

  const submitBtn = el("reportModalSubmitBtn");
  const saveLabel = `<i class="ti ti-device-floppy"></i> Submit Report`;
  setBtn(submitBtn, `<span class="btn-spinner"></span> Submitting…`, true);

  try {
    const form = readReportForm();

    if (!form.category || !form.description || !form.location || !form.item_date ||
        !form.contact_name || !form.contact_email) {
      showAlert("reportModalAlert", "Please fill in every required field before submitting.");
      setBtn(submitBtn, saveLabel, false);
      return;
    }

    if (!isLost && !form.photoFile) {
      showAlert("reportModalAlert", "A photo is required for Found Item reports. Please attach one before submitting.");
      setBtn(submitBtn, saveLabel, false);
      return;
    }

    let photo_path = null;
    if (form.photoFile) {
      photo_path = `${current.user.id}/${Date.now()}-${form.photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(photo_path, form.photoFile);
      if (uploadError) throw uploadError;
    }

    const { data: insertedItem, error: insertError } = await supabase.from("items").insert({
      type,
      category: form.category,
      description: form.description,
      location: form.location,
      item_date: form.item_date,
      approx_time: form.approx_time || null,
      color: form.color || null,
      unique_characteristics: form.unique_characteristics || null,
      additional_info: form.additional_info || null,
      photo_path,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone || null,
      status: "pending",
      reported_by: current.user.id,
    }).select().single();

    if (insertError) throw insertError;

    const newItemCode = formatItemCode(insertedItem.type, insertedItem.item_number);
    await logActivity(current, `Submitted ${isLost ? "Lost" : "Found"} Report`, newItemCode);

    showAlert("reportModalSuccess", `Report ${newItemCode} submitted! It'll appear publicly once Authorized Staff approves it.`);
    el("reportModalForm").reset();
    submitBtn.innerHTML = `<i class="ti ti-check"></i> Submitted`;

    if (typeof window.reloadItemsGrid === "function") window.reloadItemsGrid();

    setTimeout(() => {
      closeReportModal();
      showPostSubmitNotice(type, newItemCode);
    }, 1600);
  } catch (err) {
    showAlert("reportModalAlert", "Something went wrong: " + err.message);
    setBtn(submitBtn, saveLabel, false);
  }
}

async function openEditReportModal(itemId, userId) {
  ensureReportModal();
  openOverlay("reportModal");

  const body = el("reportModalBody");
  body.innerHTML = `<p class="loading-text">Loading…</p>`;

  const { data: item, error: fetchError } = await supabase.from("items").select("*").eq("id", itemId).single();
  if (fetchError || !item) {
    body.innerHTML = `<p class="loading-text">Could not load this report.</p>`;
    return;
  }

  const isLost = item.type === "lost";
  el("reportModalTitle").innerHTML = isLost
    ? `<i class="ti ti-alert-circle icon-danger"></i> Edit Lost Item Report`
    : `<i class="ti ti-package icon-success"></i> Edit Found Item Report`;

  body.innerHTML = `
    <p class="modal-form-intro">Update the details below and save your changes.</p>
    <form id="reportModalForm">
      <div class="alert alert-error" id="reportModalAlert"></div>
      <div class="alert alert-success" id="reportModalSuccess"></div>
      ${reportFormHtml(isLost, item)}
      <button type="submit" class="btn btn-primary btn-block" id="reportModalSubmitBtn"><i class="ti ti-device-floppy"></i> Save Changes</button>
    </form>`;

  const startingValues = {
    reportModalDescription: item.description,
    reportModalLocation: item.location,
    reportModalDate: item.item_date,
    reportModalApproxTime: item.approx_time,
    reportModalColor: item.color,
    reportModalCharacteristics: item.unique_characteristics,
    reportModalAdditional: item.additional_info,
    reportModalContactName: item.contact_name,
    reportModalContactEmail: item.contact_email,
    reportModalContactPhone: item.contact_phone,
  };
  Object.entries(startingValues).forEach(([id, value]) => { el(id).value = value || ""; });

  el("reportModalForm").addEventListener("submit", (e) => saveEditedReport(e, itemId, userId));
}

async function saveEditedReport(e, itemId, userId) {
  e.preventDefault();
  hideAlert("reportModalAlert");
  hideAlert("reportModalSuccess");

  const submitBtn = el("reportModalSubmitBtn");
  const saveLabel = `<i class="ti ti-device-floppy"></i> Save Changes`;
  setBtn(submitBtn, `<span class="btn-spinner"></span> Saving…`, true);

  try {
    const form = readReportForm();
    const updates = {
      category: form.category,
      description: form.description,
      location: form.location,
      item_date: form.item_date,
      approx_time: form.approx_time || null,
      color: form.color || null,
      unique_characteristics: form.unique_characteristics || null,
      additional_info: form.additional_info || null,
      contact_name: form.contact_name,
      contact_email: form.contact_email,
      contact_phone: form.contact_phone || null,
    };

    if (form.photoFile) {
      const photo_path = `${userId}/${Date.now()}-${form.photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(photo_path, form.photoFile);
      if (uploadError) throw uploadError;
      updates.photo_path = photo_path;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("items").update(updates).eq("id", itemId).select("id");
    if (updateError) throw updateError;

    if (!updatedRows || !updatedRows.length) {
      showAlert("reportModalAlert", "Report edited unsuccessful, this report can no longer be edited because it has already been approved by Authorized Staff.");
      setBtn(submitBtn, saveLabel, false);
      return;
    }

    showAlert("reportModalSuccess", "Report edited successfully.");
    submitBtn.innerHTML = `<i class="ti ti-check"></i> Saved`;

    if (typeof window.reloadItemsGrid === "function") window.reloadItemsGrid();
    loadReports(userId);

    setTimeout(closeReportModal, 1200);
  } catch (err) {
    showAlert("reportModalAlert", "Report edited unsuccessful — " + (err.message || "an unexpected error occurred. Please try again."));
    setBtn(submitBtn, saveLabel, false);
  }
}