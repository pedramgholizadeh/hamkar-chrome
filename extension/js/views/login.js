// Login view: email → magic link → poll until approved → boot the app.

const LoginView = {
  pollTimer: null,

  show() {
    Util.byId('app-view').classList.add('hidden');
    Util.byId('app-view').classList.remove('flex');
    const view = Util.byId('login-view');
    view.classList.remove('hidden');
    view.classList.add('flex');
    LoginView.resetForm();
    Util.byId('login-email').focus();
  },

  resetForm() {
    if (LoginView.pollTimer) {
      clearInterval(LoginView.pollTimer);
      LoginView.pollTimer = null;
    }
    Util.byId('login-form').classList.remove('hidden');
    Util.byId('login-waiting').classList.add('hidden');
    Util.byId('login-error').classList.add('hidden');
  },

  async start(email) {
    Util.byId('login-form').classList.add('hidden');
    Util.byId('login-waiting').classList.remove('hidden');

    let requestId;
    try {
      requestId = await Auth.requestLogin(email);
    } catch (err) {
      LoginView.fail(Util.errorFa(err));
      return;
    }

    LoginView.pollTimer = setInterval(async () => {
      let status;
      try {
        status = await Auth.poll(requestId);
      } catch {
        return; // transient network error — keep polling
      }

      if (status.status === 'approved') {
        clearInterval(LoginView.pollTimer);
        LoginView.pollTimer = null;
        await Auth.saveSession(status.token, status.user);
        App.state.user = status.user;
        App.showApp();
      } else if (status.status === 'expired') {
        LoginView.fail('لینک ورود منقضی شد؛ دوباره تلاش کن.');
      }
    }, 2500);
  },

  fail(message) {
    LoginView.resetForm();
    const box = Util.byId('login-error');
    box.textContent = message;
    box.classList.remove('hidden');
  },
};

// wire events (scripts load at the end of <body>, DOM is ready)
Util.byId('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = Util.byId('login-email').value.trim().toLowerCase();
  if (email) LoginView.start(email);
});
Util.byId('login-cancel').addEventListener('click', () => LoginView.resetForm());
