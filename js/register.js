(async function () {
  el("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    hideAlert("registerAlert");

    const email = val("email");
    if (!email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
      showAlert("registerAlert", `Please use your ${ALLOWED_EMAIL_DOMAIN} email address.`);
      return;
    }

    const fullName = val("fullName");
    const password = el("password").value;
    const role = document.querySelector('input[name="role"]:checked').value;

    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      showAlert("registerAlert", passwordCheck.message);
      return;
    }

    const btn = el("registerBtn");
    const originalLabel = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span> Creating account…`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, role } },
    });

    if (error) {
      showAlert("registerAlert", error.message);
      btn.disabled = false;
      btn.textContent = originalLabel;
      return;
    }

    btn.innerHTML = `<span class="btn-spinner"></span> Account created!`;
    document.body.classList.add("page-leaving");
    setTimeout(() => { window.location.href = "index.html"; }, 400);
  });
})();