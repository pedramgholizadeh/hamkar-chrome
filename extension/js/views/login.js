// Login state machine with full form logic:
//   email (validated) → password (eye toggle) | OTP (6 boxes, paste, auto-submit)
//   → new password (strength meter, match check) → session.

const LoginView = {
  state: { email: '', setupToken: null },
  boxes: [],
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

  // ------------------------------------------------------------- helpers

  fail(message) {
    const box = Util.byId('login-error');
    box.textContent = message;
    box.classList.remove('hidden');
  },
  clearError() {
    Util.byId('login-error').classList.add('hidden');
  },
  setLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    if (on) {
      btn.dataset.html = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';
    } else if (btn.dataset.html) {
      btn.innerHTML = btn.dataset.html;
    }
  },
  step(name) {
    LoginView.clearError();
    const order = { 'login-form': 0, 'password-form': 1, 'otp-form': 1, 'newpass-form': 2 };
    for (const id of ['login-form', 'password-form', 'otp-form', 'newpass-form']) {
      Util.byId(id).classList.toggle('hidden', id !== name);
    }
    document.querySelectorAll('#login-steps [data-step]').forEach((seg) => {
      seg.classList.toggle('on', Number(seg.dataset.step) <= order[name]);
    });
  },
  stopResendTimer() {
    if (LoginView.resendTimer) {
      clearInterval(LoginView.resendTimer);
      LoginView.resendTimer = null;
    }
  },

  // --------------------------------------------------------------- email

  stepEmail() {
    LoginView.stopResendTimer();
    LoginView.step('login-form');
  },

  validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  },

  paintEmailCheck() {
    const input = Util.byId('login-email');
    const check = Util.byId('email-check');
    const hint = Util.byId('email-hint');
    const value = input.value.trim();
    if (!value) {
      check.textContent = '';
      hint.classList.add('hidden');
      return true;
    }
    if (LoginView.validEmail(value)) {
      check.innerHTML = '<span class="ms text-lg text-mint">check_circle</span>';
      hint.classList.add('hidden');
      return true;
    }
    check.innerHTML = '<span class="ms text-lg text-rose-400">cancel</span>';
    hint.textContent = 'فرمت ایمیل درست نیست';
    hint.classList.remove('hidden');
    return false;
  },

  async start(email, forgot = false) {
    LoginView.state.email = email;
    const btn = Util.byId('email-btn');
    LoginView.setLoading(btn, true);
    let data;
    try {
      data = await Api.request('auth/start', { method: 'POST', body: { email, forgot }, auth: false });
    } catch (err) {
      LoginView.setLoading(btn, false);
      LoginView.fail(Util.errorFa(err));
      return;
    }
    LoginView.setLoading(btn, false);

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
    LoginView.renderOtpBoxes();

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

  renderOtpBoxes() {
    const holder = Util.byId('otp-boxes');
    holder.innerHTML = '';
    LoginView.boxes = [];
    for (let i = 0; i < 6; i++) {
      const box = document.createElement('input');
      box.className = 'otp-box';
      box.type = 'text';
      box.inputMode = 'numeric';
      box.maxLength = 1;
      box.autocomplete = 'one-time-code';

      box.addEventListener('input', () => {
        box.value = box.value.replace(/\D/g, '').slice(-1);
        if (box.value && i < 5) LoginView.boxes[i + 1].focus();
        if (LoginView.codeValue().length === 6) LoginView.verifyOtp();
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) {
          e.preventDefault();
          LoginView.boxes[i - 1].focus();
          LoginView.boxes[i - 1].value = '';
        }
        if (e.key === 'ArrowLeft' && i > 0) LoginView.boxes[i - 1].focus();
        if (e.key === 'ArrowRight' && i < 5) LoginView.boxes[i + 1].focus();
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const digits = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        digits.split('').forEach((d, j) => {
          if (LoginView.boxes[j]) LoginView.boxes[j].value = d;
        });
        if (digits.length === 6) LoginView.verifyOtp();
        else LoginView.boxes[Math.min(digits.length, 5)].focus();
      });

      holder.appendChild(box);
      LoginView.boxes.push(box);
    }
    LoginView.boxes[0].focus();
  },

  codeValue() {
    return LoginView.boxes.map((b) => b.value).join('');
  },

  async verifyOtp() {
    const code = LoginView.codeValue();
    const hint = Util.byId('otp-hint');
    if (code.length !== 6) {
      hint.textContent = 'کد ۶ رقمی را کامل وارد کن';
      hint.classList.remove('hidden');
      return;
    }
    LoginView.setLoading(Util.byId('otp-btn'), true);
    let data;
    try {
      data = await Api.request('auth/otp/verify', {
        method: 'POST',
        body: { email: LoginView.state.email, code },
        auth: false,
      });
    } catch (err) {
      LoginView.setLoading(Util.byId('otp-btn'), false);
      hint.textContent = Util.errorFa(err);
      hint.classList.remove('hidden');
      LoginView.boxes.forEach((b) => (b.value = ''));
      LoginView.boxes[0].focus();
      return;
    }
    LoginView.setLoading(Util.byId('otp-btn'), false);
    LoginView.stopResendTimer();
    LoginView.state.setupToken = data.setup_token;
    LoginView.step('newpass-form');
    Util.byId('newpass').focus();
  },

  // -------------------------------------------------------- new password

  strength(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  },

  paintStrength() {
    const password = Util.byId('newpass').value;
    const score = LoginView.strength(password);
    const colors = ['bg-rose-500', 'bg-rose-500', 'bg-amber-400', 'bg-cyan', 'bg-mint'];
    const labels = ['', 'ضعیف', 'ضعیف', 'متوسط', 'قوی'];
    document.querySelectorAll('[data-str]').forEach((seg) => {
      const n = Number(seg.dataset.str);
      seg.className = seg.className.replace(/bg-\S+/, 'bg-white/10');
      if (n <= score && score > 0) seg.className = seg.className.replace('bg-white/10', colors[score]);
    });
    Util.byId('str-label').textContent = password ? ('قدرت رمز: ' + labels[score]) : '';
  },

  async setPassword() {
    const p1 = Util.byId('newpass').value;
    const p2 = Util.byId('newpass2').value;
    const matchHint = Util.byId('match-hint');

    if (p1.length < 8) {
      LoginView.fail('رمز عبور حداقل ۸ کاراکتر باشد');
      return;
    }
    if (p1 !== p2) {
      matchHint.textContent = 'تکرار رمز مطابقت ندارد';
      matchHint.classList.remove('hidden');
      return;
    }
    matchHint.classList.add('hidden');

    LoginView.setLoading(Util.byId('newpass-btn'), true);
    let data;
    try {
      data = await Api.request('auth/password', {
        method: 'POST',
        body: { setup_token: LoginView.state.setupToken, password: p1 },
        auth: false,
      });
    } catch (err) {
      LoginView.setLoading(Util.byId('newpass-btn'), false);
      LoginView.fail(Util.errorFa(err));
      return;
    }
    await LoginView.enter(data);
  },

  // ---------------------------------------------------------------- login

  async loginWithPassword() {
    LoginView.setLoading(Util.byId('password-btn'), true);
    let data;
    try {
      data = await Api.request('auth/login', {
        method: 'POST',
        body: { email: LoginView.state.email, password: Util.byId('login-password').value },
        auth: false,
      });
    } catch (err) {
      LoginView.setLoading(Util.byId('password-btn'), false);
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

Util.byId('login-email').addEventListener('input', () => LoginView.paintEmailCheck());
Util.byId('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const email = Util.byId('login-email').value.trim().toLowerCase();
  if (!email) return;
  if (!LoginView.validEmail(email)) {
    LoginView.fail('فرمت ایمیل درست نیست');
    return;
  }
  LoginView.start(email);
});

Util.byId('password-form').addEventListener('submit', (e) => {
  e.preventDefault();
  LoginView.loginWithPassword();
});
Util.byId('forgot-btn').addEventListener('click', () => LoginView.start(LoginView.state.email, true));

// show/hide password toggles
document.querySelectorAll('[data-eye]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const input = Util.byId(btn.dataset.eye);
    const icon = btn.querySelector('.ms');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    icon.textContent = show ? 'visibility_off' : 'visibility';
  }));

Util.byId('otp-form').addEventListener('submit', (e) => {
  e.preventDefault();
  LoginView.verifyOtp();
});
Util.byId('resend-btn').addEventListener('click', () => {
  if (LoginView.state.email) LoginView.start(LoginView.state.email, true);
});

Util.byId('newpass').addEventListener('input', () => LoginView.paintStrength());
Util.byId('newpass-form').addEventListener('submit', (e) => {
  e.preventDefault();
  LoginView.setPassword();
});
