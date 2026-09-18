(async function () {
  const current = await requireLogin();
  if (!current) return;
  await initNavbar("lost");

  const grid = el("itemsGrid");
  const categorySelect = el("categoryFilter");

  categorySelect.innerHTML = `<option value="">All categories</option>` +
    ITEM_CATEGORIES.map((c) => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.value)}</option>`).join("");

  async function loadItems() {
    grid.innerHTML = `<p class="loading-text">Loading lost items…</p>`;
    const items = await fetchItems({ type: "lost", category: categorySelect.value });

    grid.innerHTML = items.length
      ? items.map(renderItemCard).join("")
      : `<div class="empty-state empty-state-span-all"><div class="icon"><i class="ti ti-map-search"></i></div><p>No lost items match your search.</p></div>`;
  }

  categorySelect.addEventListener("change", loadItems);
  el("clearBtn").addEventListener("click", () => {
    categorySelect.value = "";
    loadItems();
  });

  window.reloadItemsGrid = loadItems;
  loadItems();
})();

async function openItemModal(itemId) {
  ensureItemModal();
  el("itemModalBody").innerHTML = `<p class="loading-text">Loading item…</p>`;
  openOverlay("itemModal");
  await fillItemModal(itemId, false);
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

    <p class="form-hint form-hint-block"><i class="ti ti-fingerprint"></i> Identification info below is private, only Admin/Authorized Staff (or you) can ever see it. It's used to verify a claim, never shown publicly.</p>

    ${formRow(
      formField("Color", "ti-palette",
        `<input type="text" id="reportModalColor" placeholder="e.g. Black" oninput="sanitizeLettersInput(this, 'reportModalColorError')" />`,
        { errorId: "reportModalColorError" }),
      formField("Unique Characteristics", "ti-fingerprint",
        `<input type="text" id="reportModalCharacteristics" placeholder="A scratch, a sticker, what's inside, a keychain…" />`)
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
        !form.color || !form.unique_characteristics || !form.contact_name || !form.contact_email) {
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