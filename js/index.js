(async function () {
  if (await getCurrentProfile()) {
    window.location.href = "home.html";
    return;
  }

  el("forgotPasswordLink").addEventListener("click", (e) => {
    e.preventDefault();
    openForgotPasswordModal();
  });

  el("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert("loginAlert");

    const btn = el("loginBtn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> Logging in…`;

    const { error } = await supabase.auth.signInWithPassword({
      email: val("email"),
      password: el("password").value,
    });

    if (error) {
      showAlert("loginAlert", error.message);
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }

    document.body.classList.add("page-leaving");
    setTimeout(() => { window.location.href = "home.html"; }, 200);
  });
})();