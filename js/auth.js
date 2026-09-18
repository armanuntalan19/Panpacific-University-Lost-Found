function el(id) { return document.getElementById(id); }
function val(id) { return el(id).value.trim(); }
function showAlert(id, text) { const b = el(id); b.textContent = text; b.classList.add("show"); }
function hideAlert(id) { const b = el(id); if (b) b.classList.remove("show"); }
function openOverlay(id) { el(id).classList.add("show"); }
function closeOverlay(id) { const m = el(id); if (m) m.classList.remove("show"); }
function setBtn(btn, html, disabled) { btn.disabled = disabled; btn.innerHTML = html; }

function addOverlay(html, overlayId, closeBtnId) {
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  document.body.appendChild(wrap.firstElementChild);
  el(closeBtnId).addEventListener("click", () => closeOverlay(overlayId));
  el(overlayId).addEventListener("click", (e) => { if (e.target.id === overlayId) closeOverlay(overlayId); });
}

async function getCurrentProfile() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
    if (error) { console.error("Could not load profile:", error.message); return null; }
    return { user: session.user, profile };
  } catch (err) {
    console.error("Supabase is not reachable - check js/supabase-client.js:", err.message);
    return null;
  }
}

async function requireLogin(allowedRoles) {
  const current = await getCurrentProfile();
  if (!current) { window.location.href = "index.html"; return null; }
  if (allowedRoles && !allowedRoles.includes(current.profile.role)) {
    alert("You don't have permission to view this page.");
    window.location.href = "home.html";
    return null;
  }
  return current;
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "index.html";
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_HINT_TEXT = "At least 8 characters, with 1 uppercase letter, 1 number, and 1 special character.";

function validatePassword(password) {
  const rules = [
    [!password || password.length < PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`],
    [!/[A-Z]/.test(password), "Password must include at least 1 uppercase letter."],
    [!/[0-9]/.test(password), "Password must include at least 1 number."],
    [!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password), "Password must include at least 1 special character."],
  ];
  for (const [failed, message] of rules) if (failed) return { valid: false, message };
  return { valid: true, message: "" };
}

async function initNavbar(activePage) {
  const placeholder = el("navbar-placeholder");
  if (!placeholder) return;

  let current = null;
  try { current = await getCurrentProfile(); }
  catch (err) { console.error("initNavbar: could not check login state:", err); }

  const isLoggedIn = !!current;
  const role = isLoggedIn ? current.profile.role : null;

  const link = (page, label, href, icon) =>
    `<a class="nav-link ${activePage === page ? "active" : ""}" href="${href}"><i class="ti ${icon}"></i><span>${label}</span></a>`;

  const bottomSide = isLoggedIn ? `
      <button type="button" class="nav-notif-btn" id="navBellBadge" title="Notifications"><i class="ti ti-bell"></i><span>Notifications</span><span class="notif-count" id="navNotifCount" hidden>0</span></button>
      <div class="nav-user" id="navUser">
        <div class="nav-avatar">
          ${getInitials(current.profile.full_name)}
        </div>
        <span>${escapeHtml(current.profile.full_name.split(" ")[0])}</span>
        <i class="ti ti-chevron-down chevron"></i>
        <div class="nav-dropdown" id="navDropdown">
          <button type="button" id="navChangePasswordBtn"><i class="ti ti-key"></i> Change Password</button>
          <button class="logout" id="navLogoutBtn"><i class="ti ti-logout"></i> Log Out</button>
        </div>
      </div>`
    : `<a class="btn-login" href="index.html"><i class="ti ti-login-2"></i> Log In</a>`;

  placeholder.innerHTML = `
    <nav class="navbar" id="navbar">
      <a href="home.html" class="nav-brand">
        <img src="images/logo.png" alt="Panpacific University" class="nav-logo" />
        <div class="brand-text">
          <div class="brand-title">Lost &amp; Found</div>
          <div class="brand-sub">Panpacific University</div>
        </div>
      </a>

      <div class="nav-links" id="navLinks">
        ${link("home", "Home", "home.html", "ti-home")}
        ${link("lost", "Lost Items", "lost-items.html", "ti-search")}
        ${link("found", "Found Items", "found-items.html", "ti-box")}
        ${isLoggedIn ? link("dashboard", "Dashboard", "dashboard.html", "ti-layout-dashboard") : ""}
        ${isLoggedIn && role === "admin" ? link("admin", "Admin Panel", "admin.html", "ti-shield-lock") : ""}
      </div>

      <div class="nav-bottom">
        ${bottomSide}
      </div>
    </nav>
    <div class="nav-toggle-bar" id="navToggleBar">
      <button class="nav-toggle" id="navToggleMobile" aria-label="Toggle sidebar"><i class="ti ti-layout-sidebar-left-collapse"></i></button>
    </div>`;

  function alignNavToggle() {
    const toggle = el("navToggleMobile");
    if (!toggle) return;
    if (window.innerWidth <= 900) { toggle.style.top = ""; return; }
    const brand = document.querySelector(".nav-brand");
    if (!brand) return;
    const rect = brand.getBoundingClientRect();
    toggle.style.top = (rect.top + rect.height / 2 - toggle.offsetHeight / 2) + "px";
  }
  alignNavToggle();
  window.addEventListener("resize", alignNavToggle);

  let wasMobileWidth = window.innerWidth <= 900;
  window.addEventListener("resize", () => {
    const nav = el("navbar");
    if (!nav) return;
    const isMobileWidth = window.innerWidth <= 900;
    if (isMobileWidth !== wasMobileWidth) {
      nav.classList.remove("collapsed", "mobile-open");
      document.body.classList.remove("sidebar-collapsed");
      wasMobileWidth = isMobileWidth;
    }
  });

  el("navToggleMobile").addEventListener("click", () => {
    const nav = el("navbar");
    if (window.innerWidth <= 900) {
      nav.classList.toggle("mobile-open");
    } else {
      nav.classList.toggle("collapsed");
      document.body.classList.toggle("sidebar-collapsed");
    }
    requestAnimationFrame(alignNavToggle);
  });

  if (isLoggedIn) {
    el("navUser").addEventListener("click", (e) => {
      el("navDropdown").classList.toggle("show");
      e.stopPropagation();
    });
    document.addEventListener("click", () => el("navDropdown").classList.remove("show"));
    el("navLogoutBtn").addEventListener("click", logout);

    ensurePasswordModal();
    el("navChangePasswordBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      el("navDropdown").classList.remove("show");
      openPasswordModal(current.user.email);
    });

    loadNotificationBadge(current.user.id);
    el("navBellBadge").addEventListener("click", (e) => {
      e.stopPropagation();
      if (typeof window.goToDashboardNotifications === "function") window.goToDashboardNotifications();
      else window.location.href = "dashboard.html#notifications";
    });
  }

  return current;
}

function passwordFieldHtml(label, id, options = {}) {
  return `
          <div class="form-group">
            <label>${label}</label>
            <div class="input-wrap">
              <i class="ti ti-lock"></i>
              <input type="password" id="${id}" ${options.minLength ? `minlength="${PASSWORD_MIN_LENGTH}"` : ""} required />
            </div>
            ${options.hint ? `<p class="form-hint">${PASSWORD_HINT_TEXT}</p>` : ""}
          </div>`;
}

function ensurePasswordModal() {
  if (el("passwordModal")) return;

  addOverlay(`
    <div class="modal-overlay" id="passwordModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3><i class="ti ti-key"></i> Change Password</h3>
          <button type="button" class="modal-close" id="passwordModalClose"><i class="ti ti-x"></i></button>
        </div>
        <form id="changePasswordForm">
          <div class="alert alert-error" id="passwordModalAlert"></div>
          ${passwordFieldHtml("Current Password", "currentPassword")}
          ${passwordFieldHtml("New Password", "newPassword", { minLength: true, hint: true })}
          ${passwordFieldHtml("Confirm New Password", "confirmNewPassword", { minLength: true })}
          <button type="submit" class="btn btn-primary btn-block" id="changePasswordBtn">
            <i class="ti ti-device-floppy"></i> Update Password
          </button>
        </form>
      </div>
    </div>`, "passwordModal", "passwordModalClose");

  el("changePasswordForm").addEventListener("submit", handleChangePassword);
}

function openPasswordModal(email) {
  el("passwordModal").dataset.email = email;
  el("changePasswordForm").reset();
  hideAlert("passwordModalAlert");
  openOverlay("passwordModal");
}

function closePasswordModal() { closeOverlay("passwordModal"); }

async function handleChangePassword(e) {
  e.preventDefault();
  hideAlert("passwordModalAlert");

  const email = el("passwordModal").dataset.email;
  const currentPassword = el("currentPassword").value;
  const newPassword = el("newPassword").value;
  const confirmNewPassword = el("confirmNewPassword").value;

  const check = validatePassword(newPassword);
  if (!check.valid) return showAlert("passwordModalAlert", check.message);
  if (newPassword !== confirmNewPassword) return showAlert("passwordModalAlert", "New password and confirmation do not match.");
  if (newPassword === currentPassword) return showAlert("passwordModalAlert", "New password must be different from your current password.");

  const btn = el("changePasswordBtn");
  const saveLabel = '<i class="ti ti-device-floppy"></i> Update Password';
  btn.disabled = true;
  btn.textContent = "Updating…";

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) {
    showAlert("passwordModalAlert", "Current password is incorrect.");
    setBtn(btn, saveLabel, false);
    return;
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  setBtn(btn, saveLabel, false);
  if (updateError) return showAlert("passwordModalAlert", updateError.message);

  closePasswordModal();
  alert("Your password has been updated.");
}

async function loadNotificationBadge(userId) {
  const { count, error } = await supabase
    .from("notifications").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("is_read", false);

  if (error) return;
  const countEl = el("navNotifCount");
  if (!countEl) return;
  if (count && count > 0) {
    countEl.textContent = count > 9 ? "9+" : count;
    countEl.hidden = false;
  } else {
    countEl.hidden = true;
  }
}

function ensureForgotPasswordModal() {
  if (el("forgotPasswordModal")) return;

  addOverlay(`
    <div class="modal-overlay" id="forgotPasswordModal">
      <div class="modal-box">
        <div class="modal-header">
          <h3><i class="ti ti-key"></i> Forgot Password</h3>
          <button type="button" class="modal-close" id="forgotPasswordModalClose"><i class="ti ti-x"></i></button>
        </div>
        <form id="forgotPasswordForm">
          <div class="alert alert-error" id="forgotPasswordAlert"></div>
          <div class="alert alert-success" id="forgotPasswordSuccess"></div>

          <div class="form-group">
            <label>Email</label>
            <div class="input-wrap">
              <i class="ti ti-mail"></i>
              <input type="email" id="forgotPasswordEmail" placeholder="you@panpacificu.edu.ph" required />
            </div>
            <p class="form-hint">We'll send a password reset link to this email.</p>
          </div>

          <button type="submit" class="btn btn-primary btn-block" id="forgotPasswordBtn">
            <i class="ti ti-send"></i> Send Reset Link
          </button>
        </form>
      </div>
    </div>`, "forgotPasswordModal", "forgotPasswordModalClose");

  el("forgotPasswordForm").addEventListener("submit", handleForgotPassword);
}

function openForgotPasswordModal() {
  ensureForgotPasswordModal();
  el("forgotPasswordForm").reset();
  hideAlert("forgotPasswordAlert");
  hideAlert("forgotPasswordSuccess");
  openOverlay("forgotPasswordModal");
}

function closeForgotPasswordModal() { closeOverlay("forgotPasswordModal"); }

async function handleForgotPassword(e) {
  e.preventDefault();
  hideAlert("forgotPasswordAlert");
  hideAlert("forgotPasswordSuccess");

  const email = val("forgotPasswordEmail");
  const btn = el("forgotPasswordBtn");
  const originalLabel = btn.innerHTML;
  setBtn(btn, `<span class="btn-spinner"></span> Sending…`, true);

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname.replace(/login\.html$/, "reset-password.html"),
  });

  setBtn(btn, originalLabel, false);
  if (error) return showAlert("forgotPasswordAlert", error.message);

  showAlert("forgotPasswordSuccess", "Reset link sent! Check your inbox (and spam folder).");
}

async function logActivity(current, actionText, targetCode) {
  if (!current) return;
  await supabase.from("activity_log").insert({
    actor_id: current.user.id,
    actor_name: current.profile.full_name,
    action: actionText,
    target_code: targetCode || null,
  });
}