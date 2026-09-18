(function () {
  let recoveryReady = false;

  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recoveryReady = true;
  });

  el("resetPasswordForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert("resetPasswordAlert");

    const newPassword = el("newPassword").value;
    const confirmNewPassword = el("confirmNewPassword").value;

    const check = validatePassword(newPassword);
    if (!check.valid) return showAlert("resetPasswordAlert", check.message);
    if (newPassword !== confirmNewPassword) return showAlert("resetPasswordAlert", "New password and confirmation do not match.");

    const btn = el("resetPasswordBtn");
    const originalLabel = btn.innerHTML;
    setBtn(btn, `<span class="btn-spinner"></span> Updating…`, true);

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      showAlert("resetPasswordAlert", recoveryReady
        ? error.message
        : "This reset link is invalid or has expired. Please request a new one from the login page.");
      setBtn(btn, originalLabel, false);
      return;
    }

    btn.innerHTML = `<span class="btn-spinner"></span> Password updated!`;
    document.body.classList.add("page-leaving");
    setTimeout(() => { window.location.href = "index.html"; }, 600);
  });
})();