// Login state machine:
//   email → password (returning user) | OTP code (first time / forgot)
//   OTP verified → set password → session. Password login → session.

const LoginView = {
  state: { email: '', setupToken: null },
  resendTimer: null,

  show() {
    Util.byId('app-view').classList.add('hidden');
    Util.byId('app-view').classList.remove('flex');
    const view = Util.byId('login-view');
    view.classList.remove('hidden');
    view.classList.add('flex');
    LoginView.stepEmail();
    Util.byId('login-email').focus();
  },

  fail(message) {
    const box = Util.byId('login-error');
    box.textContent = message;
    box.classList.remove('hidden');
  },

  clearError() {
    Util.byId('login-error').classList.add('hidden');
  },

  step(name) {
    LoginView.clearError();
    for (const id of ['login-form', 'password-form', 'otp-form', 'newpass-form']) {
      Util.byId(id).classList.toggle('hidden', id !== name);
    }
  },

  stopResendTimer() {
    if (LoginView.resendTimer) {
      clearInterval(LoginView.resendTimer);
      LoginView.resendTimer = null;
    }
  },

  stepEmail() {
    LoginView.stopResendTimer();
    LoginView.step('login-form');
  },

  // ------------------------------------------------------- email submitted

  async start(email, forgot = false) {
    LoginView.state.email = email;
    let data;
    try {
      data = await Api.request('auth/start', { method: 'POST', body: { email, forgot }, auth: false });
    } catch (err) {
      LoginView.fail(Util.errorFa(err));
      return;
    }

    if (data.mode === 'password') {
      LoginView.step('password-form');
      Util.byId('login-password').focus();
    } else {
      LoginView.stepOtp();
    }
  },

  // ----------------------------------------------------------------- OTP

  stepOtp() {
    LoginView.step('otp-form');
    Util.byId('otp-email').textContent = LoginView.state.email;
    Util.byId('login-code').value = '';
    Util.byId('login-code').focus();

    // 2-minute resend countdown
    let secondsLeft = 120;
    const btn = Util.byId('resend-btn');
    const tick = () => {
      if (secondsLeft <= 0) {
        LoginView.stopResendTimer();
        btn.disabled = false;
        btn.textContent = 'ارسال مجدد کد';
        return;
      }
      btn.disabled = true;
      btn.textContent = 'ارسال مجدد تا ' + Math.floor(secondsLeft / 60) + ':' + String(secondsLeft % 60).padStart(2, '0');
      secondsLeft -= 1;
    };
    LoginView.stopResendTimer();
    tick();
    LoginView.resendTimer = setInterval(tick, 1000);
  },

  async verifyOtp() {
    const code = Util.byId('login-code').value.replace(/\D/g, '');
    if (code.length !== 6) {
      LoginView.fail('کد ۶ رقمی را کامل وارد کن');
      return;
    }
    let data;
    try {
      data = await Api.request('auth/otp/verify', {
        method: 'POST',
        body: { email: LoginView.state.email, code },
        auth: false,
      });
    } catch (err) {
      LoginView.fail(Util.errorFa(err));
      return;
    }
    LoginView.stopResendTimer();
    LoginView.state.setupToken = data.setup_token;
    LoginView.step('newpass-form');
    Util.byId('newpass').focus();
  },

  // ------------------------------------------------------------ set password

  async setPassword() {
    const p1 = Util.byId('newpass').value;
    const p2 = Util.byId('newpass2').value;
    if (p1.length < 8) {
      LoginView.fail('رمز عبور حداقل ۸ کاراکتر باشد');
      return;
    }
    if (p1 !== p2) {
      LoginView.fail('تکرار رمز عبور مطابقت ندارد');
      return;
    }

    let data;
    try {
      data = await Api.request('auth/password', {
        method: 'POST',
        body: { setup_token: LoginView.state.setupToken, password: p1 },
        auth: false,
      });
    } catch (err) {
      LoginView.fail(Util.errorFa(err));
      return;
    }
    await LoginView.enter(data);
  },

  // ---------------------------------------------------------------- login

  async loginWithPassword() {
    let data;
    try {
      data = await Api.request('auth/login', {
        method: 'POST',
        body: { email: LoginView.state.email, password: Util.byId('login-password').value },
        auth: false,
      });
    } catch (err) {
      LoginView.fail(Util.errorFa(err));
      return;
    }
    await LoginView.enter(data);
  },

  async enter(data) {
    await Auth.saveSession(data.token, data.user);
    App.state.user = data.user;
    App.showApp();
  },
};

// -------------------------------------------------------------- wiring

Util.byId('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = Util.byId('login-email').value.trim().toLowerCase();
  if (email) LoginView.start(email);
});

Util.byId('password-form').addEventListener('submit', (e) => {
  e.preventDefault();
  LoginView.loginWithPassword();
});
Util.byId('forgot-btn').addEventListener('click', () => LoginView.start(LoginView.state.email, true));

Util.byId('otp-form').addEventListener('submit', (e) => {
  e.preventDefault();
  LoginView.verifyOtp();
});
Util.byId('login-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  if (e.target.value.length === 6) LoginView.verifyOtp();
});
Util.byId('resend-btn').addEventListener('click', () => {
  if (LoginView.state.email) LoginView.start(LoginView.state.email, true);
});

Util.byId('newpass-form').addEventListener('submit', (e) => {
  e.preventDefault();
  LoginView.setPassword();
});
